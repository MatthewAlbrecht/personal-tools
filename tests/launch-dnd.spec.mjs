import { expect, test } from "@playwright/test";

const LAYOUT_KEY = "launch-layout-v2";

function seededLayout() {
	return {
		version: 7,
		bookmarks: [
			{
				_id: "alpha",
				_creationTime: 1,
				title: "Alpha",
				url: "#alpha",
				tags: ["top"],
				padPosition: 0,
				projects: [
					{
						projectId: "one",
						position: 0,
						name: "Alpha prod",
						environment: "prod",
					},
				],
			},
			{
				_id: "beta",
				_creationTime: 2,
				title: "Beta",
				url: "#beta",
				tags: ["top"],
				padPosition: 1,
				projects: [{ projectId: "one", position: 1, environment: "prod" }],
			},
			{
				_id: "gamma",
				_creationTime: 3,
				title: "Gamma",
				url: "#gamma",
				tags: ["pinned"],
				padPosition: 0,
				projects: [{ projectId: "two", position: 0, environment: "qa" }],
			},
		],
		projects: [
			{ _id: "one", name: "One", position: 0, createdAt: 1 },
			{ _id: "two", name: "Two", position: 1, createdAt: 2 },
			{ _id: "empty", name: "Empty", position: 2, createdAt: 3 },
		],
	};
}

async function installHarness(page, options = {}) {
	const layout = options.layout || seededLayout();
	await page.addInitScript(
		({ dndDisabled, legacyOptIn, layout, online }) => {
			if (legacyOptIn) {
				localStorage.setItem("launch-dnd-enabled", "1");
			}
			if (dndDisabled) {
				localStorage.setItem("launch-dnd-disabled", "1");
			}
			const SERVER_KEY = "launch-fixture-server";
			const storedServer = sessionStorage.getItem(SERVER_KEY);
			if (!storedServer) {
				localStorage.setItem(
					"launch-layout-v2",
					JSON.stringify({
						schemaVersion: 2,
						layoutVersion: layout.version,
						bookmarks: layout.bookmarks,
						projects: layout.projects,
						savedAt: 1,
					}),
				);
				sessionStorage.setItem(SERVER_KEY, JSON.stringify(layout));
			}
			Object.defineProperty(navigator, "onLine", {
				configurable: true,
				get: () => window.__launchFixture.online,
			});
			window.__launchFixture = {
				layout: storedServer
					? JSON.parse(storedServer)
					: structuredClone(layout),
				online,
				calls: [],
				waiters: [],
				subscriber: null,
				vibrations: [],
				operations() {
					return this.calls
						.filter((call) => call.name === "launch:applyLayoutOperation")
						.map((call) => call.args);
				},
				mutation(name, args) {
					this.calls.push({ name, args });
					if (name !== "launch:applyLayoutOperation")
						return Promise.resolve(null);
					return new Promise((resolve, reject) =>
						this.waiters.push({ args, resolve, reject }),
					);
				},
				setServer(snapshot) {
					this.layout = structuredClone(snapshot);
					sessionStorage.setItem(SERVER_KEY, JSON.stringify(snapshot));
				},
				resolveNext() {
					const waiter = this.waiters.shift();
					const applied = window.launchModel.applyLayoutOperation(
						this.layout,
						waiter.args.operation,
					);
					if (!applied.ok) throw new Error(applied.reason);
					this.setServer({
						...applied.layout,
						version: this.layout.version + 1,
					});
					waiter.resolve({
						status: "applied",
						operationId: waiter.args.operationId,
						...structuredClone(this.layout),
					});
				},
				conflictNext() {
					this.waiters.shift().resolve({
						status: "conflict",
						...structuredClone(this.layout),
					});
				},
				rejectNext() {
					this.waiters.shift().reject(new Error("fixture rejection"));
				},
				publish(snapshot) {
					this.setServer(snapshot);
					this.subscriber?.(structuredClone(snapshot));
				},
			};
			navigator.vibrate = (duration) => {
				window.__launchFixture.vibrations.push(duration);
				return true;
			};
			window.__launchCls = 0;
			window.__launchClsSupported =
				PerformanceObserver.supportedEntryTypes?.includes("layout-shift") ??
				false;
			if (window.__launchClsSupported) {
				new PerformanceObserver((list) => {
					for (const entry of list.getEntries()) {
						if (!entry.hadRecentInput) window.__launchCls += entry.value;
					}
				}).observe({ type: "layout-shift", buffered: true });
			}
		},
		{
			dndDisabled: options.dndDisabled ?? false,
			legacyOptIn: options.legacyOptIn ?? false,
			layout,
			online: options.online ?? true,
		},
	);
	await page.route("https://esm.sh/convex@1.46.0/browser", async (route) => {
		await route.fulfill({
			contentType: "application/javascript",
			body: `
				export class ConvexClient {
					constructor() {}
					mutation(name, args) { return window.__launchFixture.mutation(name, args); }
					onUpdate(name, args, next) {
						window.__launchFixture.subscriber = next;
						queueMicrotask(() => next(structuredClone(window.__launchFixture.layout)));
						return () => {};
					}
				}
			`,
		});
	});
	if (options.moduleFailure) {
		await page.route("**/launch-dnd.mjs", (route) => route.abort());
	} else if (options.moduleGate) {
		await page.route("**/launch-dnd.mjs", async (route) => {
			options.moduleGate.paintedBeforeRequest = await page.evaluate(() =>
				Boolean(document.querySelector('#pad [title="Alpha"]')),
			);
			options.moduleGate.requested();
			await options.moduleGate.released;
			await route.continue();
		});
	}
	await page.route("**/api/launch-config", (route) =>
		route.fulfill({ json: { convexUrl: "https://fixture.invalid" } }),
	);
	await page.route("https://www.google.com/s2/favicons**", (route) =>
		route.abort(),
	);
}

async function openLaunch(page, options) {
	await installHarness(page, options);
	await page.goto("/launch.html");
	await expect
		.poll(() => page.evaluate(() => Boolean(window.launchDndController)))
		.toBe(true);
}

function handle(page, name) {
	return page
		.locator("#pad")
		.getByRole("button", { name: `Move ${name}`, exact: true });
}

async function center(locator) {
	const box = await locator.boundingBox();
	if (!box) throw new Error("Expected visible drag target");
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function drag(page, source, target, offset = {}) {
	const from = await center(source);
	const to = await center(target);
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(from.x + 8, from.y + 8);
	await page.mouse.move(to.x + (offset.x || 0), to.y + (offset.y || 0), {
		steps: 4,
	});
	await page.mouse.up();
}

async function padOrder(page, zone) {
	return page
		.locator(`[data-drop-zone="${zone}"] > [data-sort-kind="bookmark"]`)
		.evaluateAll((nodes) => nodes.map((node) => node.dataset.sortId));
}

async function projectOrder(page, projectId) {
	return page
		.locator(
			`[data-drop-zone="project:${projectId}"] > [data-sort-kind="bookmark"]`,
		)
		.evaluateAll((nodes) => nodes.map((node) => node.dataset.sortId));
}

async function sortableGeometry(page) {
	return page.evaluate(() =>
		[
			...document.querySelectorAll(
				"[data-sort-kind][data-sort-id], [data-drop-zone], .project-gap",
			),
		].map((element) => {
			const rect = element.getBoundingClientRect();
			const data = element.dataset;
			return {
				key: [
					"dragHandle" in data ? "handle" : element.tagName,
					data.sortKind || "",
					data.sortId || "",
					data.zone || data.dropZone || "",
					data.position ?? "",
				].join(":"),
				x: rect.x,
				y: rect.y,
				width: rect.width,
				height: rect.height,
			};
		}),
	);
}

async function startFlickerProbe(page) {
	await page.evaluate(() => {
		function orders() {
			return JSON.stringify(
				[
					...document.querySelectorAll(
						"[data-drop-list='bookmarks'][data-drop-zone]",
					),
				].map((list) => [
					list.dataset.dropZone,
					[...list.children]
						.filter((node) => node.matches("[data-sort-kind='bookmark']"))
						.map((node) => node.dataset.sortId),
				]),
			);
		}
		const probe = { records: 0, snapshots: [] };
		probe.record = (records) => {
			if (records.length === 0) return;
			probe.records += records.length;
			probe.snapshots.push(orders());
		};
		probe.observer = new MutationObserver(probe.record);
		for (const root of [
			document.getElementById("pad"),
			document.getElementById("projects"),
		]) {
			probe.observer.observe(root, {
				attributes: true,
				characterData: true,
				childList: true,
				subtree: true,
			});
		}
		window.__flickerProbe = probe;
	});
}

async function stopFlickerProbe(page) {
	return page.evaluate(() => {
		const probe = window.__flickerProbe;
		probe.record(probe.observer.takeRecords());
		probe.observer.disconnect();
		return {
			records: probe.records,
			snapshots: [...new Set(probe.snapshots)].map((value) =>
				Object.fromEntries(JSON.parse(value)),
			),
		};
	});
}

async function cachedLayout(page) {
	return page.evaluate(
		(key) => JSON.parse(localStorage.getItem(key)),
		LAYOUT_KEY,
	);
}

function zoneIds(cache, zone) {
	return cache.bookmarks
		.filter((item) => item.tags.includes(zone))
		.sort((a, b) => a.padPosition - b.padPosition)
		.map((item) => item._id);
}

test("cached first paint precedes delayed enhancement and adds zero CLS", async ({
	page,
	browserName,
}) => {
	const moduleGate = {};
	const requested = new Promise((resolve) => {
		moduleGate.requested = resolve;
	});
	moduleGate.released = new Promise((resolve) => {
		moduleGate.release = resolve;
	});
	await installHarness(page, { moduleGate });
	await page.goto("/launch.html", { waitUntil: "domcontentloaded" });
	await requested;
	expect(moduleGate.paintedBeforeRequest).toBe(true);
	await expect(page.locator("#pad").getByTitle("Alpha")).toBeVisible();
	const before = await page.locator(".board").boundingBox();
	const cachedGeometry = await sortableGeometry(page);
	expect(
		cachedGeometry.filter((entry) => entry.key.startsWith("handle:")),
	).toHaveLength(9);
	expect(await page.evaluate(() => Boolean(window.launchDndController))).toBe(
		false,
	);
	await expect
		.poll(() => page.evaluate(() => Boolean(window.__launchFixture.subscriber)))
		.toBe(true);
	await page.evaluate(
		() => new Promise((resolve) => requestAnimationFrame(() => resolve())),
	);
	expect(await sortableGeometry(page)).toEqual(cachedGeometry);
	await startFlickerProbe(page);
	moduleGate.release();
	await expect
		.poll(() => page.evaluate(() => Boolean(window.launchDndController)))
		.toBe(true);
	await page.waitForTimeout(100);
	expect(await stopFlickerProbe(page)).toEqual({ records: 0, snapshots: [] });
	expect(await page.locator(".board").boundingBox()).toEqual(before);
	expect(await sortableGeometry(page)).toEqual(cachedGeometry);
	const cls = await page.evaluate(() => ({
		supported: window.__launchClsSupported,
		value: window.__launchCls,
	}));
	if (browserName === "chromium") {
		expect(cls.supported).toBe(true);
		expect(cls.value).toBe(0);
	} else {
		test.info().annotations.push({
			type: "limitation",
			description:
				"WebKit does not expose layout-shift PerformanceObserver entries; stable bounding boxes cover enhancement geometry.",
		});
	}
});

test("failed enhancement preserves links and context menus", async ({
	page,
}) => {
	await installHarness(page, { moduleFailure: true });
	await page.goto("/launch.html");
	await expect(page.locator("#pad").getByTitle("Beta")).toBeVisible();
	expect(await page.evaluate(() => Boolean(window.launchDndController))).toBe(
		false,
	);
	await page.locator("#pad").getByTitle("Beta").click();
	await expect(page).toHaveURL(/#beta$/);
	await page.locator("#pad").getByTitle("Beta").click({ button: "right" });
	await expect(page.locator(".menu")).toBeVisible();
});

test("enhancement is on by default with or without the prior local opt-in", async ({
	browser,
}) => {
	for (const options of [{}, { legacyOptIn: true }]) {
		const context = await browser.newContext();
		const page = await context.newPage();
		await openLaunch(page, options);
		expect(
			await page.evaluate(() => localStorage.getItem("launch-dnd-enabled")),
		).toBe(options.legacyOptIn ? "1" : null);
		await context.close();
	}
});

test("query and local kill switches prevent default-on enhancement", async ({
	browser,
}) => {
	for (const [options, path] of [
		[{ dndDisabled: true }, "/launch.html"],
		[{}, "/launch.html?launch-dnd=0"],
		[{ legacyOptIn: true, dndDisabled: true }, "/launch.html"],
		[{ legacyOptIn: true }, "/launch.html?launch-dnd=0"],
	]) {
		const context = await browser.newContext();
		const page = await context.newPage();
		const moduleRequests = [];
		page.on("request", (request) => {
			if (request.url().endsWith("/launch-dnd.mjs")) {
				moduleRequests.push(request.url());
			}
		});
		await installHarness(page, options);
		await page.goto(path);
		await expect(page.locator("#pad").getByTitle("Alpha")).toBeVisible();
		await page.waitForTimeout(100);
		expect(await page.evaluate(() => Boolean(window.launchDndController))).toBe(
			false,
		);
		expect(moduleRequests).toEqual([]);
		await context.close();
	}
});

test("mouse threshold, live displacement, exact Pad insertion, click, and context menu", async ({
	page,
}) => {
	await openLaunch(page);
	const alpha = handle(page, "Alpha");
	const start = await center(alpha);
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(start.x + 3, start.y);
	await expect(page.locator(".launch-drag-overlay")).toHaveCount(0);
	await page.mouse.up();
	await expect.poll(() => padOrder(page, "top")).toEqual(["alpha", "beta"]);
	await expect(alpha).toBeFocused();
	expect(new URL(page.url()).hash).toBe("");

	await page.mouse.move(start.x, start.y);
	await page.mouse.down({ button: "right" });
	await page.mouse.move(start.x + 20, start.y + 20, { steps: 3 });
	await expect(page.locator(".launch-drag-overlay")).toHaveCount(0);
	await page.mouse.up({ button: "right" });
	await page.keyboard.press("Escape");
	expect(
		await page.evaluate(() => window.launchDndController.getState().phase),
	).toBe("idle");

	const gammaTile = page.locator(
		'[data-drop-zone="pinned"] > [data-zone="pinned"][data-sort-id="gamma"]',
	);
	const before = await gammaTile.boundingBox();
	if (!before) throw new Error("Expected visible Gamma row");
	const target = { x: before.x + before.width / 2, y: before.y + 2 };
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(start.x + 8, start.y + 8);
	await page.mouse.move(target.x, target.y, { steps: 4 });
	await expect(page.locator(".launch-drag-overlay")).toBeVisible();
	await expect
		.poll(async () => {
			const during = await gammaTile.boundingBox();
			return during?.x !== before.x || during?.y !== before.y;
		})
		.toBe(true);
	await page.mouse.up();
	await expect.poll(() => padOrder(page, "pinned")).toEqual(["alpha", "gamma"]);
	await expect.poll(() => padOrder(page, "top")).toEqual(["beta"]);
	await expect
		.poll(() => page.evaluate(() => window.__launchFixture.waiters.length))
		.toBe(1);
	const [sent] = await page.evaluate(() => window.__launchFixture.operations());
	expect(sent.expectedVersion).toBe(7);
	expect(sent.operation).toEqual({
		kind: "movePadLink",
		bookmarkId: "alpha",
		targetZone: "pinned",
		targetIndex: 0,
	});
	await page.evaluate(() => window.__launchFixture.resolveNext());
	await expect(page.locator("#status")).toHaveText("");

	await page.locator("#pad").getByTitle("Beta").click();
	await expect(page).toHaveURL(/#beta$/);
	await page.locator("#pad").getByTitle("Beta").click({ button: "right" });
	await expect(page.locator(".menu")).toBeVisible();
	await page.keyboard.press("Escape");

	await page.route("https://esm.sh/convex@1.46.0/browser", (route) =>
		route.abort(),
	);
	await page.reload();
	await expect.poll(() => padOrder(page, "pinned")).toEqual(["alpha", "gamma"]);
	expect(await padOrder(page, "top")).toEqual(["beta"]);
	expect(
		await page.locator('[data-sort-id="alpha"][data-zone="top"]').count(),
	).toBe(0);
});

test("autoscroll starts at the viewport edge and recomputes the target", async ({
	page,
}) => {
	await openLaunch(page);
	await page.evaluate(() => {
		document.body.style.minHeight = "300vh";
		const list = document.querySelector('[data-drop-zone="pinned"]');
		window.scrollTo(0, list.getBoundingClientRect().top + scrollY - 16);
	});
	const scrolledFrom = await page.evaluate(() => scrollY);
	expect(scrolledFrom).toBeGreaterThan(0);
	const from = await center(handle(page, "Gamma"));
	expect(from.y).toBeLessThan(48);
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(from.x + 8, from.y);
	await expect(page.locator(".launch-drag-overlay")).toBeVisible();
	const point = { x: from.x + 9, y: from.y };

	function probe(sample) {
		return page.evaluate(
			({ x, y }) => ({
				scrollY,
				target: window.launchDndController.getState().target,
				zones: document
					.elementsFromPoint(x, y)
					.map((element) => element.closest("[data-drop-zone]"))
					.filter(Boolean)
					.map((element) => element.dataset.dropZone),
			}),
			sample,
		);
	}
	const preScroll = await probe(point);
	expect(preScroll.scrollY).toBe(scrolledFrom);
	expect(preScroll.target).toEqual({ valid: true, zone: "pinned", index: 0 });
	expect(preScroll.zones).toContain("pinned");

	await page.evaluate(() => {
		window.__autoscrollSamples = [];
		function sample() {
			if (!window.launchDndController.isActive()) return;
			window.__autoscrollSamples.push({
				scrollY,
				target: window.launchDndController.getState().target,
			});
			requestAnimationFrame(sample);
		}
		sample();
	});
	// The only pointer movement after pickup: 1px sideways inside the top edge.
	await page.mouse.move(point.x, point.y);
	await expect
		.poll(() => page.evaluate(() => scrollY))
		.toBeLessThan(scrolledFrom);
	await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
	await page.evaluate(
		() => new Promise((resolve) => requestAnimationFrame(() => resolve())),
	);
	const postScroll = await probe(point);
	expect(postScroll.zones).toContain("top");
	expect(postScroll.zones).not.toContain("pinned");
	expect(postScroll.target).toMatchObject({ valid: true, zone: "top" });
	expect(postScroll.target).not.toEqual(preScroll.target);
	const samples = await page.evaluate(() => window.__autoscrollSamples);
	expect(samples[0]).toEqual({
		scrollY: scrolledFrom,
		target: preScroll.target,
	});
	expect(
		samples.some(
			(sample) =>
				sample.scrollY < scrolledFrom && sample.target?.zone === "top",
		),
	).toBe(true);

	await page.mouse.up();
	const topOrder = ["alpha", "beta"];
	topOrder.splice(postScroll.target.index, 0, "gamma");
	await expect.poll(() => padOrder(page, "top")).toEqual(topOrder);
	expect(await padOrder(page, "pinned")).toEqual([]);
	const [sent] = await page.evaluate(() => window.__launchFixture.operations());
	expect(sent.operation).toEqual({
		kind: "movePadLink",
		bookmarkId: "gamma",
		targetZone: "top",
		targetIndex: postScroll.target.index,
	});
});

test("project placement stays additive and projects reorder", async ({
	page,
}) => {
	await openLaunch(page);
	await drag(
		page,
		handle(page, "Beta"),
		page.locator('[data-drop-zone="project:empty"]'),
	);
	await expect(
		page.locator(
			'[data-drop-zone="project:empty"] > [data-zone="project:empty"][data-sort-id="beta"]',
		),
	).toBeVisible();
	await expect(
		page.locator(
			'[data-drop-zone="top"] > [data-zone="top"][data-sort-id="beta"]',
		),
	).toBeVisible();

	await drag(
		page,
		page.locator(
			'[data-zone="project:one"] [data-drag-handle][data-sort-id="alpha"]',
		),
		page.locator('[data-drop-zone="project:two"]'),
	);
	await expect(
		page.locator(
			'[data-drop-zone="project:one"] > [data-zone="project:one"][data-sort-id="alpha"]',
		),
	).toBeVisible();
	await expect(
		page.locator(
			'[data-drop-zone="project:two"] > [data-zone="project:two"][data-sort-id="alpha"]',
		),
	).toBeVisible();

	const projectHandle = page.getByRole("button", {
		name: "Move One project",
		exact: true,
	});
	await projectHandle.focus();
	await page.keyboard.press("Enter");
	await page.keyboard.press("End");
	await page.keyboard.press("Enter");
	await expect
		.poll(() =>
			page
				.locator('#projects > [data-sort-kind="project"]')
				.evaluateAll((nodes) => nodes.map((node) => node.dataset.sortId)),
		)
		.toEqual(["two", "empty", "one"]);
});

test("pointer project reorder drags a heading chip into an exact gap", async ({
	page,
}) => {
	await openLaunch(page);
	const section = page.locator('#projects > section[data-sort-id="one"]');
	const sectionBox = await section.boundingBox();
	const from = await center(
		page.getByRole("button", { name: "Move One project", exact: true }),
	);
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(from.x + 3, from.y);
	await expect(page.locator(".launch-drag-overlay")).toHaveCount(0);
	await page.mouse.move(from.x + 8, from.y);

	const chip = page.locator(".launch-drag-overlay");
	await expect(chip).toHaveCount(1);
	await expect(chip).toHaveClass(/launch-drag-project-overlay/);
	await expect(chip).toHaveText("One");
	await expect(chip).toHaveAttribute("aria-hidden", "true");
	await expect(chip).toHaveCSS("position", "fixed");
	await expect(chip).toHaveCSS("pointer-events", "none");
	await expect(chip).toHaveCSS("text-transform", "uppercase");
	await expect(chip).toHaveCSS("white-space", "nowrap");
	await expect(chip.locator(".mark, img")).toHaveCount(0);
	await expect(page.locator(".launch-drag-placeholder")).toHaveAttribute(
		"data-placeholder-kind",
		"project",
	);
	const placeholder = await page
		.locator(".launch-drag-placeholder")
		.boundingBox();
	expect(placeholder.width).toBeCloseTo(sectionBox.width, 0);
	expect(placeholder.height).toBeCloseTo(sectionBox.height, 0);

	async function chipBox() {
		await page.evaluate(
			() => new Promise((resolve) => requestAnimationFrame(() => resolve())),
		);
		return chip.boundingBox();
	}
	const picked = await chipBox();
	expect(picked.height).toBe(30);
	expect(picked.width).toBeLessThanOrEqual(13 * 16);
	expect(picked.width).toBeLessThan(sectionBox.width);
	expect(picked.width).not.toBe(44);
	const pointer = { x: from.x + 8, y: from.y };
	expect(pointer.x).toBeGreaterThanOrEqual(picked.x);
	expect(pointer.x).toBeLessThanOrEqual(picked.x + picked.width);
	expect(pointer.y).toBeGreaterThanOrEqual(picked.y);
	expect(pointer.y).toBeLessThanOrEqual(picked.y + picked.height);
	const offset = { x: pointer.x - picked.x, y: pointer.y - picked.y };

	const gap = await center(
		page.locator('#projects > .project-gap[data-position="2"]'),
	);
	await page.mouse.move(gap.x, gap.y, { steps: 5 });
	await expect
		.poll(() =>
			page.evaluate(() => window.launchDndController.getState().target),
		)
		.toEqual({ valid: true, zone: "project-list", index: 2 });
	await expect(page.locator("#projects > .launch-drop-rule")).toHaveCount(1);
	const moved = await chipBox();
	expect(moved.width).toBe(picked.width);
	expect(moved.height).toBe(picked.height);
	expect(Math.abs(gap.x - moved.x - offset.x)).toBeLessThanOrEqual(1);
	expect(Math.abs(gap.y - moved.y - offset.y)).toBeLessThanOrEqual(1);

	await page.mouse.up();
	await expect
		.poll(() =>
			page
				.locator('#projects > [data-sort-kind="project"]')
				.evaluateAll((nodes) => nodes.map((node) => node.dataset.sortId)),
		)
		.toEqual(["two", "one", "empty"]);
	await expect(page.locator(".launch-drag-overlay")).toHaveCount(0);
	await expect(page.locator(".launch-drag-placeholder")).toHaveCount(0);
	const [sent] = await page.evaluate(() => window.__launchFixture.operations());
	expect(sent.operation).toEqual({
		kind: "moveProject",
		projectId: "one",
		targetIndex: 1,
	});
	expect(await projectOrder(page, "one")).toEqual(["alpha", "beta"]);
});

test("populated, same-project, cross-project, and existing-target placement stay exact", async ({
	page,
}) => {
	await openLaunch(page);

	const betaInOne = page.locator(
		'[data-zone="project:one"] [data-drag-handle][data-sort-id="beta"]',
	);
	await betaInOne.focus();
	await page.keyboard.press("Enter");
	await page.keyboard.press("Home");
	await page.keyboard.press("Enter");
	await expect.poll(() => projectOrder(page, "one")).toEqual(["beta", "alpha"]);
	await expect(
		page.locator('[data-zone="project:one"][data-sort-id="beta"] .env-label'),
	).toHaveText("prod");

	const gammaInTwo = page.locator(
		'[data-zone="project:two"] [data-drag-handle][data-sort-id="gamma"]',
	);
	await gammaInTwo.focus();
	await page.keyboard.press("Enter");
	await page.keyboard.press("Shift+Tab");
	await page.keyboard.press("End");
	await page.keyboard.press("Enter");
	await expect
		.poll(() => projectOrder(page, "one"))
		.toEqual(["beta", "alpha", "gamma"]);
	await expect(
		page.locator(
			'[data-drop-zone="project:two"] > [data-zone="project:two"][data-sort-id="gamma"]',
		),
	).toHaveCount(1);
	await expect(
		page.locator(
			'[data-drop-zone="project:two"] > [data-zone="project:two"][data-sort-id="gamma"] .env-label',
		),
	).toHaveText("qa");

	const alphaInOne = page.locator(
		'[data-zone="project:one"] [data-drag-handle][data-sort-id="alpha"]',
	);
	await alphaInOne.focus();
	await page.keyboard.press("Enter");
	await page.keyboard.press("Tab");
	await page.keyboard.press("Home");
	await page.keyboard.press("Enter");
	await expect
		.poll(() => projectOrder(page, "two"))
		.toEqual(["alpha", "gamma"]);

	await alphaInOne.focus();
	await page.keyboard.press("Enter");
	await page.keyboard.press("Tab");
	await page.keyboard.press("End");
	await page.keyboard.press("Enter");
	await expect
		.poll(() => projectOrder(page, "two"))
		.toEqual(["gamma", "alpha"]);
	await expect(
		page.locator(
			'[data-drop-zone="project:two"] > [data-zone="project:two"][data-sort-id="alpha"]',
		),
	).toHaveCount(1);
	await expect(
		page.locator(
			'[data-drop-zone="project:one"] > [data-zone="project:one"][data-sort-id="alpha"]',
		),
	).toHaveCount(1);
});

test("invalid outside drop cancels without optimistic mutation", async ({
	page,
}) => {
	await openLaunch(page);
	const alpha = handle(page, "Alpha");
	const from = await center(alpha);
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(from.x + 8, from.y + 8);
	await page.mouse.move(2, 2);
	await expect(page.locator("#launch-dnd-live")).toContainText(
		"Can’t drop here",
	);
	await page.mouse.up();
	await expect.poll(() => padOrder(page, "top")).toEqual(["alpha", "beta"]);
	expect(
		await page.evaluate(
			() =>
				window.__launchFixture.calls.filter(
					(call) => call.name === "launch:applyLayoutOperation",
				).length,
		),
	).toBe(0);
});

test("keyboard supports geometry, zone cycling, drop, cancel, and focus restoration", async ({
	page,
}) => {
	await openLaunch(page);
	const alpha = handle(page, "Alpha");
	const live = page.locator("#launch-dnd-live");
	await alpha.focus();
	await page.keyboard.press("Enter");
	await expect(alpha).toHaveAttribute("aria-pressed", "true");
	await expect(live).toHaveText(
		"Moving Alpha. Top, position 1 of 2. Use arrow keys to move, Tab to change section, Enter to drop, or Escape to cancel.",
	);
	await page.keyboard.press("ArrowRight");
	await expect(live).toHaveText("Top, position 2 of 2.");
	await page.keyboard.press("Escape");
	await expect(live).toHaveText(
		"Move canceled. Alpha returned to Top, position 1.",
	);
	await expect(alpha).not.toHaveAttribute("aria-pressed", "true");
	await expect(alpha).toBeFocused();
	expect(await padOrder(page, "top")).toEqual(["alpha", "beta"]);

	await page.keyboard.press("Enter");
	await page.keyboard.press("Tab");
	await expect(live).toHaveText("Pinned, position 1 of 2.");
	await page.keyboard.press("Shift+Tab");
	await expect(live).toHaveText("Top, position 1 of 2.");
	await page.keyboard.press("Tab");
	await page.keyboard.press("End");
	await expect(live).toHaveText("Pinned, position 2 of 2.");
	await page.keyboard.press("Enter");
	await expect(live).toHaveText("Moved Alpha to Pinned, position 2.");
	await expect.poll(() => padOrder(page, "pinned")).toEqual(["gamma", "alpha"]);
	await expect(handle(page, "Alpha")).toBeFocused();
	await expect(handle(page, "Alpha")).not.toHaveAttribute("aria-pressed");

	await page.keyboard.press(" ");
	await page.keyboard.press("Home");
	await page.keyboard.press("Escape");
	await expect.poll(() => padOrder(page, "pinned")).toEqual(["gamma", "alpha"]);
	await expect(handle(page, "Alpha")).toBeFocused();
	await expect(live).toHaveText(
		"Move canceled. Alpha returned to Pinned, position 2.",
	);

	await page.keyboard.press("c");
	await expect(page.locator(".add-dialog")).toBeVisible();
});

test("keyboard Top grid moves by four-column geometry with clamping", async ({
	page,
}) => {
	const layout = seededLayout();
	for (const [index, name] of ["Delta", "Echo", "Foxtrot", "Golf"].entries()) {
		layout.bookmarks.push({
			_id: name.toLowerCase(),
			_creationTime: 10 + index,
			title: name,
			url: `#${name.toLowerCase()}`,
			tags: ["top"],
			padPosition: index + 2,
			projects: [],
		});
	}
	await openLaunch(page, { layout });
	const live = page.locator("#launch-dnd-live");
	await handle(page, "Alpha").focus();
	await page.keyboard.press("Enter");
	await page.keyboard.press("ArrowDown");
	await expect(live).toHaveText("Top, position 5 of 6.");
	await page.keyboard.press("ArrowDown");
	await expect(live).toHaveText("Top, position 6 of 6.");
	await page.keyboard.press("ArrowUp");
	await expect(live).toHaveText("Top, position 2 of 6.");
	await page.keyboard.press("ArrowLeft");
	await expect(live).toHaveText("Top, position 1 of 6.");
	await page.keyboard.press("ArrowLeft");
	await expect(live).toHaveText("Top, position 1 of 6.");
	await page.keyboard.press("End");
	await expect(live).toHaveText("Top, position 6 of 6.");
	await page.keyboard.press("Home");
	await page.keyboard.press("ArrowRight");
	await page.keyboard.press("ArrowRight");
	await page.keyboard.press("Enter");
	await expect
		.poll(() => padOrder(page, "top"))
		.toEqual(["beta", "delta", "alpha", "echo", "foxtrot", "golf"]);
});

test("Pad bookmark inserts exactly into a populated project additively", async ({
	page,
}) => {
	await openLaunch(page);
	await handle(page, "Gamma").focus();
	await page.keyboard.press("Enter");
	await page.keyboard.press("Tab");
	await expect(page.locator("#launch-dnd-live")).toHaveText(
		"One, position 1 of 3.",
	);
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("Enter");
	await expect
		.poll(() => projectOrder(page, "one"))
		.toEqual(["alpha", "gamma", "beta"]);
	expect(await padOrder(page, "pinned")).toEqual(["gamma"]);
	expect(await projectOrder(page, "two")).toEqual(["gamma"]);
	await expect(
		page.locator(
			'[data-drop-zone="project:two"] > [data-sort-id="gamma"] .env-label',
		),
	).toHaveText("qa");
	await expect(
		page.locator(
			'[data-drop-zone="project:one"] > [data-sort-id="gamma"] .env-label',
		),
	).toHaveCount(0);
	const [sent] = await page.evaluate(() => window.__launchFixture.operations());
	expect(sent.operation).toEqual({
		kind: "placeProjectLink",
		bookmarkId: "gamma",
		targetProjectId: "one",
		targetIndex: 1,
	});
});

test("optimistic persistence is immediate, serialized, and rollback is exact", async ({
	page,
}) => {
	const layout = seededLayout();
	layout.bookmarks.push({
		_id: "delta",
		_creationTime: 4,
		title: "Delta",
		url: "#delta",
		tags: ["top"],
		padPosition: 2,
		projects: [],
	});
	await openLaunch(page, { layout });
	const status = page.locator("#status");
	const statusRegion = page.locator("#status-region");
	function pending(id) {
		return page.locator(
			`[data-sort-kind="bookmark"][data-sort-id="${id}"][data-pending="true"]:not([data-drag-handle])`,
		);
	}
	function sentOperations() {
		return page.evaluate(() => window.__launchFixture.operations());
	}
	const alphaMove = {
		kind: "movePadLink",
		bookmarkId: "alpha",
		targetZone: "top",
		targetIndex: 2,
	};
	const betaMove = {
		kind: "movePadLink",
		bookmarkId: "beta",
		targetZone: "pinned",
		targetIndex: 1,
	};

	await handle(page, "Alpha").focus();
	await page.keyboard.press("Enter");
	await page.keyboard.press("End");
	await page.keyboard.press("Enter");
	await expect
		.poll(() => padOrder(page, "top"))
		.toEqual(["beta", "delta", "alpha"]);
	await expect(pending("alpha").first()).toBeVisible();
	await expect(status).toHaveText("Saving order…");
	await expect(statusRegion).not.toHaveAttribute("data-persistent", "true");
	expect(zoneIds(await cachedLayout(page), "top")).toEqual([
		"beta",
		"delta",
		"alpha",
	]);
	await expect
		.poll(() => page.evaluate(() => window.__launchFixture.waiters.length))
		.toBe(1);
	const [firstSend] = await sentOperations();
	expect(firstSend).toMatchObject({ expectedVersion: 7, operation: alphaMove });

	await handle(page, "Beta").focus();
	await page.keyboard.press("Enter");
	await page.keyboard.press("Tab");
	await page.keyboard.press("End");
	await page.keyboard.press("Enter");
	await expect.poll(() => padOrder(page, "top")).toEqual(["delta", "alpha"]);
	expect(await padOrder(page, "pinned")).toEqual(["gamma", "beta"]);
	await expect(pending("beta").first()).toBeVisible();
	await expect(pending("alpha").first()).toBeVisible();
	await expect(status).toHaveText("Saving order…");
	const bothCached = await cachedLayout(page);
	expect(zoneIds(bothCached, "top")).toEqual(["delta", "alpha"]);
	expect(zoneIds(bothCached, "pinned")).toEqual(["gamma", "beta"]);
	await page.waitForTimeout(100);
	expect(await sentOperations()).toHaveLength(1);

	for (let attempt = 0; attempt < 4; attempt += 1) {
		await expect
			.poll(() => page.evaluate(() => window.__launchFixture.waiters.length))
			.toBe(1);
		await expect
			.poll(async () => (await sentOperations()).length)
			.toBe(attempt + 1);
		expect((await sentOperations()).at(-1)).toEqual(firstSend);
		if (attempt < 3) await expect(status).toHaveText("Saving order…");
		await page.evaluate(() => window.__launchFixture.rejectNext());
	}

	await expect(status).toHaveText(
		"Couldn’t save that move. Your previous order is restored.",
	);
	await expect(statusRegion).toHaveAttribute("data-persistent", "true");
	// Only the rejected Alpha move is rolled back; the independent Beta move
	// stays optimistic, so this differs from both "both applied" and "neither".
	await expect.poll(() => padOrder(page, "top")).toEqual(["alpha", "delta"]);
	expect(await padOrder(page, "pinned")).toEqual(["gamma", "beta"]);
	await expect(handle(page, "Alpha")).toBeFocused();
	await expect(pending("alpha")).toHaveCount(0);
	await expect(pending("beta").first()).toBeVisible();
	const rolledBack = await cachedLayout(page);
	const expectedRollback = await page.evaluate(
		({ layout, operation }) =>
			window.launchModel.applyLayoutOperation(layout, operation).layout,
		{ layout, operation: betaMove },
	);
	expect(rolledBack.layoutVersion).toBe(7);
	expect(rolledBack.bookmarks).toEqual(expectedRollback.bookmarks);
	expect(rolledBack.projects).toEqual(expectedRollback.projects);
	expect(rolledBack.bookmarks.find((item) => item._id === "alpha")).toEqual(
		layout.bookmarks[0],
	);

	await expect.poll(async () => (await sentOperations()).length).toBe(5);
	const operations = await sentOperations();
	expect(
		new Set(operations.slice(0, 4).map((args) => args.operationId)).size,
	).toBe(1);
	expect(operations[4]).toMatchObject({
		expectedVersion: 7,
		operation: betaMove,
	});
	expect(operations[4].operationId).not.toBe(firstSend.operationId);
	await expect(status).toHaveText(
		"Couldn’t save that move. Your previous order is restored.",
	);

	await page.evaluate(() => window.__launchFixture.resolveNext());
	await expect(status).toHaveText("");
	await expect(statusRegion).not.toHaveAttribute("data-persistent", "true");
	await expect(page.locator('[data-pending="true"]')).toHaveCount(0);
	expect(await padOrder(page, "top")).toEqual(["alpha", "delta"]);
	expect(await padOrder(page, "pinned")).toEqual(["gamma", "beta"]);
	const acknowledged = await cachedLayout(page);
	const server = await page.evaluate(() => window.__launchFixture.layout);
	expect(acknowledged.layoutVersion).toBe(8);
	expect(server.version).toBe(8);
	expect(acknowledged.bookmarks).toEqual(expectedRollback.bookmarks);
	expect(await sentOperations()).toHaveLength(5);
});

test("a rollback status stays until dismissed when nothing else succeeds", async ({
	page,
}) => {
	await openLaunch(page);
	await handle(page, "Alpha").focus();
	await page.keyboard.press("Enter");
	await page.keyboard.press("ArrowRight");
	await page.keyboard.press("Enter");
	await expect.poll(() => padOrder(page, "top")).toEqual(["beta", "alpha"]);
	for (let attempt = 0; attempt < 4; attempt += 1) {
		await expect
			.poll(() => page.evaluate(() => window.__launchFixture.waiters.length))
			.toBe(1);
		await page.evaluate(() => window.__launchFixture.rejectNext());
	}
	await expect(page.locator("#status")).toHaveText(
		"Couldn’t save that move. Your previous order is restored.",
	);
	await expect.poll(() => padOrder(page, "top")).toEqual(["alpha", "beta"]);
	await page.waitForTimeout(300);
	await expect(page.locator("#status")).toHaveText(
		"Couldn’t save that move. Your previous order is restored.",
	);
	expect(
		await page.evaluate(() => window.__launchFixture.operations().length),
	).toBe(4);
	await page.getByRole("button", { name: /dismiss/i }).click();
	await expect(page.locator("#status")).toHaveText("");
	await expect(page.locator("#status-region")).not.toHaveAttribute(
		"data-persistent",
		"true",
	);
});

test("successful acknowledgment clears pending state and a duplicate cannot double-apply", async ({
	page,
}) => {
	await openLaunch(page);
	await handle(page, "Alpha").focus();
	await page.keyboard.press("Enter");
	await page.keyboard.press("ArrowRight");
	await page.keyboard.press("Enter");
	await handle(page, "Gamma").focus();
	await page.keyboard.press("Enter");
	await page.keyboard.press("Shift+Tab");
	await page.keyboard.press("Home");
	await page.keyboard.press("Enter");
	await expect
		.poll(() => padOrder(page, "top"))
		.toEqual(["gamma", "beta", "alpha"]);
	await expect(page.locator("#status")).toHaveText("Saving order…");
	for (const id of ["alpha", "gamma"]) {
		await expect(
			page
				.locator(
					`[data-sort-id="${id}"][data-pending="true"]:not([data-drag-handle])`,
				)
				.first(),
		).toBeVisible();
	}
	await expect
		.poll(() => page.evaluate(() => window.__launchFixture.operations().length))
		.toBe(1);
	await page.waitForTimeout(100);
	expect(
		await page.evaluate(() => window.__launchFixture.operations().length),
	).toBe(1);
	await startFlickerProbe(page);
	await page.evaluate(() => window.__launchFixture.resolveNext());
	await expect
		.poll(() => page.evaluate(() => window.__launchFixture.operations().length))
		.toBe(2);
	await expect(page.locator("#status")).toHaveText("Saving order…");
	await expect(
		page.locator('[data-sort-id="alpha"][data-pending="true"]'),
	).toHaveCount(0);
	const [first, second] = await page.evaluate(() =>
		window.__launchFixture.operations(),
	);
	expect(first.expectedVersion).toBe(7);
	expect(second.expectedVersion).toBe(8);
	expect(second.operationId).not.toBe(first.operationId);
	expect(second.operation).toEqual({
		kind: "movePadLink",
		bookmarkId: "gamma",
		targetZone: "top",
		targetIndex: 0,
	});
	await page.evaluate(() => window.__launchFixture.resolveNext());
	await expect(page.locator("#status")).toHaveText("");
	await expect(page.locator('[data-pending="true"]')).toHaveCount(0);
	const acknowledgments = await stopFlickerProbe(page);
	expect(acknowledgments.records).toBeGreaterThan(0);
	for (const snapshot of acknowledgments.snapshots) {
		expect(snapshot.top).toEqual(["gamma", "beta", "alpha"]);
		expect(snapshot.pinned).toEqual([]);
	}
	const acknowledged = await page.evaluate(() => window.__launchFixture.layout);
	expect(acknowledged.version).toBe(9);
	await startFlickerProbe(page);
	await page.evaluate(
		(snapshot) => window.__launchFixture.publish(snapshot),
		acknowledged,
	);
	await page.waitForTimeout(100);
	expect(await stopFlickerProbe(page)).toEqual({ records: 0, snapshots: [] });
	expect(
		await page.evaluate(() => window.__launchFixture.operations().length),
	).toBe(2);
	expect(await padOrder(page, "top")).toEqual(["gamma", "beta", "alpha"]);
	expect(await padOrder(page, "pinned")).toEqual([]);
	await expect(
		page.locator('[data-drop-zone="top"] > [data-sort-id="gamma"]'),
	).toHaveCount(1);
});

test("offline retry, remote rebase, and deletion focus", async ({ page }) => {
	await openLaunch(page, { online: false });
	await handle(page, "Alpha").focus();
	await page.keyboard.press("Enter");
	await page.keyboard.press("ArrowRight");
	await page.keyboard.press("Enter");
	await expect(page.locator("#status")).toHaveText(
		"You’re offline. Reconnect, then try the move again.",
	);
	await expect.poll(() => padOrder(page, "top")).toEqual(["beta", "alpha"]);
	await page.waitForTimeout(300);
	expect(
		await page.evaluate(() => window.__launchFixture.operations()),
	).toEqual([]);
	const offlineCache = await page.evaluate(
		(key) => localStorage.getItem(key),
		LAYOUT_KEY,
	);
	expect(offlineCache).not.toMatch(/operationId|pending/);
	await page.evaluate(() => {
		window.__launchFixture.online = true;
		window.dispatchEvent(new Event("online"));
	});
	await expect
		.poll(() => page.evaluate(() => window.__launchFixture.waiters.length))
		.toBe(1);

	const remote = seededLayout();
	remote.version = 8;
	remote.bookmarks[0].title = "Remote Alpha";
	remote.bookmarks[0].projects[0].environment = "stage";
	await startFlickerProbe(page);
	await page.evaluate(
		(snapshot) => window.__launchFixture.publish(snapshot),
		remote,
	);
	await expect(page.locator("#pad").getByTitle("Remote Alpha")).toBeVisible();
	await page.waitForTimeout(100);
	const rebase = await stopFlickerProbe(page);
	expect(rebase.records).toBeGreaterThan(0);
	expect(rebase.snapshots).toEqual([
		{
			top: ["beta", "alpha"],
			pinned: ["gamma"],
			"project:one": ["alpha", "beta"],
			"project:two": ["gamma"],
			"project:empty": [],
		},
	]);
	await expect(
		page.locator(
			'[data-drop-zone="project:one"] > [data-sort-id="alpha"] .env-label',
		),
	).toHaveText("stage");
	await expect(
		page.locator('[data-drop-zone="project:one"] > [data-sort-id="alpha"]'),
	).toHaveCount(1);
	expect(await padOrder(page, "top")).toEqual(["beta", "alpha"]);
	await expect(
		page.locator('[data-drop-zone="top"] > [data-sort-id="alpha"]'),
	).toHaveCount(1);

	const remoteDeleted = structuredClone(remote);
	remoteDeleted.version = 9;
	remoteDeleted.bookmarks = remoteDeleted.bookmarks.filter(
		(item) => item._id !== "alpha",
	);
	await handle(page, "Remote Alpha").focus();
	await page.evaluate(
		(snapshot) => window.__launchFixture.publish(snapshot),
		remoteDeleted,
	);
	await expect(page.locator("#launch-dnd-live")).toContainText(
		"no longer available",
	);
	await expect
		.poll(() =>
			page.evaluate(() => ({
				id: document.activeElement?.id,
				tag: document.activeElement?.tagName,
			})),
		)
		.toEqual({ id: "", tag: "H2" });
});

test("reduced motion removes lift and FLIP while order and announcements update", async ({
	page,
}) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await openLaunch(page);
	const alpha = handle(page, "Alpha");
	const from = await center(alpha);
	const gamma = await page
		.locator('[data-drop-zone="pinned"] > [data-sort-id="gamma"]')
		.boundingBox();
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(from.x + 8, from.y + 8);
	await page.mouse.move(gamma.x + gamma.width / 2, gamma.y + 2, { steps: 4 });
	await expect(page.locator(".launch-drag-overlay")).toBeVisible();
	await expect(page.locator(".launch-drop-rule")).toBeVisible();
	const motion = await page.evaluate(() => {
		const overlay = document.querySelector(".launch-drag-overlay");
		return {
			animations: document.getAnimations().length,
			translate: overlay.style.translate,
			transition: getComputedStyle(overlay).transitionDuration,
		};
	});
	expect(motion.animations).toBe(0);
	expect(motion.translate).not.toBe("0 -2px");
	expect(motion.transition).toBe("0s");
	await page.mouse.up();
	await expect.poll(() => padOrder(page, "pinned")).toEqual(["alpha", "gamma"]);
	expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);

	await handle(page, "Beta").focus();
	await page.keyboard.press("Enter");
	await page.keyboard.press("Tab");
	await expect(page.locator("#launch-dnd-live")).toHaveText(
		"Pinned, position 1 of 3.",
	);
	await page.keyboard.press("Enter");
	await expect(page.locator("#launch-dnd-live")).toHaveText(
		"Moved Beta to Pinned, position 1.",
	);
	await expect
		.poll(() => padOrder(page, "pinned"))
		.toEqual(["beta", "alpha", "gamma"]);
});

test("real touch long-press drags and a short tap does not", async ({
	page,
	browserName,
}) => {
	test.skip(
		browserName !== "chromium",
		"CDP touch input is Chromium-only; WebKit touch uses synthetic pointer events below.",
	);
	const cdp = await page.context().newCDPSession(page);
	await cdp.send("Emulation.setTouchEmulationEnabled", {
		enabled: true,
		maxTouchPoints: 1,
	});
	await openLaunch(page);
	const from = await center(handle(page, "Gamma"));
	const alphaTile = await page
		.locator('[data-drop-zone="top"] > [data-sort-id="alpha"]')
		.boundingBox();
	async function touch(type, point) {
		await cdp.send("Input.dispatchTouchEvent", {
			type,
			touchPoints: point ? [{ x: point.x, y: point.y }] : [],
		});
	}

	await touch("touchStart", from);
	await page.waitForTimeout(80);
	await touch("touchEnd");
	await expect(page.locator(".launch-drag-overlay")).toHaveCount(0);

	await touch("touchStart", from);
	await page.waitForTimeout(350);
	await expect(page.locator(".launch-drag-overlay")).toBeVisible();
	expect(await page.evaluate(() => window.__launchFixture.vibrations)).toEqual([
		10,
	]);
	const target = { x: alphaTile.x + 4, y: alphaTile.y + alphaTile.height / 2 };
	for (let step = 1; step <= 6; step += 1) {
		await touch("touchMove", {
			x: from.x + ((target.x - from.x) * step) / 6,
			y: from.y + ((target.y - from.y) * step) / 6,
		});
	}
	await expect
		.poll(() =>
			page.evaluate(() => window.launchDndController.getState().target),
		)
		.toEqual({ valid: true, zone: "top", index: 0 });
	await touch("touchEnd");
	await expect
		.poll(() => padOrder(page, "top"))
		.toEqual(["gamma", "alpha", "beta"]);
});

test("synthetic touch covers tap focus, long-press boundaries, and drop without navigation", async ({
	page,
	browserName,
}) => {
	test.info().annotations.push({
		type: "manual-limitation",
		description:
			"Real native iOS Safari touch (UIKit gesture arbitration, scroll versus long-press, haptics) cannot be automated by Playwright WebKit. This test dispatches synthetic touch PointerEvents through the production handlers; it is not a native touch pass. Verify on a physical iPhone.",
	});
	await openLaunch(page);
	const selector = '#pad [data-drag-handle][data-sort-id="gamma"]';
	const gamma = page.locator(selector);
	const overlay = page.locator(".launch-drag-overlay");
	await expect(gamma).toHaveCSS("touch-action", "pan-y");
	await gamma.evaluate((element) => {
		element.setPointerCapture = () => {};
		element.releasePointerCapture = () => {};
		element.hasPointerCapture = () => true;
	});
	const start = await center(gamma);
	const alphaTile = await page
		.locator('[data-drop-zone="top"] > [data-sort-id="alpha"]')
		.boundingBox();

	async function pointer(type, pointerId, point = start) {
		await page.evaluate(
			({ selector, type, pointerId, point }) => {
				const init = {
					bubbles: true,
					cancelable: true,
					pointerId,
					pointerType: "touch",
					isPrimary: true,
					button: type === "pointermove" ? -1 : 0,
					clientX: point.x,
					clientY: point.y,
				};
				document
					.querySelector(selector)
					.dispatchEvent(
						type === "click"
							? new MouseEvent("click", init)
							: new PointerEvent(type, init),
					);
			},
			{ selector, type, pointerId, point },
		);
	}
	function phase() {
		return page.evaluate(() => window.launchDndController.getState().phase);
	}
	function vibrations() {
		return page.evaluate(() => window.__launchFixture.vibrations);
	}
	function touchMovePrevented() {
		return page.evaluate((selector) => {
			if (typeof TouchEvent !== "function") return null;
			const event = new TouchEvent("touchmove", {
				bubbles: true,
				cancelable: true,
			});
			document.querySelector(selector).dispatchEvent(event);
			return event.defaultPrevented;
		}, selector);
	}
	function hash() {
		return page.evaluate(() => location.hash);
	}

	await pointer("pointerdown", 40);
	await page.waitForTimeout(100);
	expect(await phase()).toBe("pressed");
	await pointer("pointerup", 40);
	await pointer("click", 40);
	expect(await phase()).toBe("idle");
	await expect(overlay).toHaveCount(0);
	await expect(gamma).toBeFocused();
	expect(await vibrations()).toEqual([]);
	expect(await hash()).toBe("");

	await pointer("pointerdown", 41);
	await page.waitForTimeout(120);
	expect(await phase()).toBe("pressed");
	await expect(overlay).toHaveCount(0);
	expect([false, null]).toContain(await touchMovePrevented());
	await pointer("pointermove", 41, { x: start.x + 8, y: start.y });
	expect(await phase()).not.toBe("idle");
	await expect(overlay).toBeVisible();
	expect(await phase()).toBe("dragging");
	expect(await vibrations()).toEqual([10]);
	expect([true, null]).toContain(await touchMovePrevented());
	await pointer("pointercancel", 41);
	await expect(overlay).toHaveCount(0);
	expect(await phase()).toBe("idle");
	expect(await padOrder(page, "pinned")).toEqual(["gamma"]);

	await pointer("pointerdown", 42);
	await pointer("pointermove", 42, { x: start.x + 9, y: start.y });
	expect(await phase()).toBe("idle");
	await page.waitForTimeout(300);
	await expect(overlay).toHaveCount(0);
	expect(await vibrations()).toEqual([10]);

	await pointer("pointerdown", 43);
	await expect(overlay).toBeVisible();
	expect(await vibrations()).toEqual([10, 10]);
	const target = { x: alphaTile.x + 4, y: alphaTile.y + alphaTile.height / 2 };
	for (let step = 1; step <= 6; step += 1) {
		await pointer("pointermove", 43, {
			x: start.x + ((target.x - start.x) * step) / 6,
			y: start.y + ((target.y - start.y) * step) / 6,
		});
	}
	await expect
		.poll(() =>
			page.evaluate(() => window.launchDndController.getState().target),
		)
		.toEqual({ valid: true, zone: "top", index: 0 });
	await pointer("pointerup", 43, target);
	await expect(overlay).toHaveCount(0);
	await expect
		.poll(() => padOrder(page, "top"))
		.toEqual(["gamma", "alpha", "beta"]);
	expect(await padOrder(page, "pinned")).toEqual([]);
	expect(await vibrations()).toEqual([10, 10]);
	expect(await hash()).toBe("");
	const operations = await page.evaluate(() =>
		window.__launchFixture.operations(),
	);
	expect(operations.map((args) => args.operation)).toEqual([
		{
			kind: "movePadLink",
			bookmarkId: "gamma",
			targetZone: "top",
			targetIndex: 0,
		},
	]);
	test.info().annotations.push({
		type: "coverage",
		description: `synthetic touch PointerEvents exercised in ${browserName}`,
	});
});

for (const mode of ["delayed", "failed"]) {
	test(`shortcuts, popovers, menus, and add dialog work with ${mode} enhancement`, async ({
		page,
		browserName,
	}) => {
		const layout = seededLayout();
		for (const [index, slug] of ["one", "two"].entries()) {
			layout.bookmarks.push({
				_id: `site-${slug}`,
				_creationTime: 20 + index,
				title: `Site ${slug}`,
				url: `https://example.com/${slug}`,
				tags: ["top"],
				padPosition: 2 + index,
				projects: [],
			});
		}
		const moduleGate = {};
		const requested = new Promise((resolve) => {
			moduleGate.requested = resolve;
		});
		moduleGate.released = new Promise((resolve) => {
			moduleGate.release = resolve;
		});
		if (mode === "delayed") {
			await installHarness(page, { layout, moduleGate });
		} else {
			await installHarness(page, { layout, moduleFailure: true });
		}
		const moduleFailed =
			mode === "failed"
				? page.waitForEvent("requestfailed", (request) =>
						request.url().endsWith("/launch-dnd.mjs"),
					)
				: null;
		await page.goto("/launch.html", { waitUntil: "commit" });
		if (mode === "delayed") await requested;
		else await moduleFailed;
		await expect
			.poll(() => page.evaluate(() => document.readyState))
			.not.toBe("loading");
		if (mode === "delayed" && browserName === "webkit") {
			test.info().annotations.push({
				type: "limitation",
				description:
					"WebKit holds the window load event while the DnD dynamic import is pending; DOMContentLoaded, paint, and interaction are unaffected.",
			});
		}
		await expect(page.locator("#pad").getByTitle("Alpha")).toBeVisible();
		expect(await page.evaluate(() => Boolean(window.launchDndController))).toBe(
			false,
		);

		await page.keyboard.press("c");
		await expect(page.locator(".add-dialog")).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.locator(".add-dialog")).toHaveCount(0);

		await page
			.locator(
				'#pad [data-zone="top"][data-sort-id="alpha"]:not([data-drag-handle])',
			)
			.hover();
		await page.keyboard.press("a");
		await expect(page.locator("input.rename")).toHaveValue("Alpha");
		await expect(page.locator("input.rename")).toBeFocused();
		await page.keyboard.press("Escape");
		await expect(page.locator("input.rename")).toHaveCount(0);

		await page
			.locator(
				'[data-zone="project:one"][data-sort-id="alpha"]:not([data-drag-handle])',
			)
			.hover();
		await page.keyboard.press("e");
		await expect(
			page.locator('.popover[data-kind="environment"]'),
		).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.locator(".popover")).toHaveCount(0);

		await page
			.locator(
				'#pad [data-zone="pinned"][data-sort-id="gamma"]:not([data-drag-handle])',
			)
			.hover();
		await page.keyboard.press("g");
		await expect(page.locator(".popover.group-picker")).toContainText("Two");
		await page.keyboard.press("Escape");
		await expect(page.locator(".popover")).toHaveCount(0);

		await page.locator('#pad button.tile[title="Site one"]').click();
		await expect(page.locator(".popover .choice")).toHaveCount(2);
		await page.keyboard.press("Escape");
		await expect(page.locator(".popover")).toHaveCount(0);

		await page.locator("#pad").getByTitle("Beta").click({ button: "right" });
		await expect(page.locator(".menu")).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.locator(".menu")).toHaveCount(0);

		await page.locator("#pad").getByTitle("Beta").click();
		await expect(page).toHaveURL(/#beta$/);
		expect(
			await page.evaluate(() => window.__launchFixture.operations()),
		).toEqual([]);

		if (mode === "delayed") {
			moduleGate.release();
			await expect
				.poll(() => page.evaluate(() => Boolean(window.launchDndController)))
				.toBe(true);
			await handle(page, "Alpha").focus();
			await page.keyboard.press("Enter");
			await expect(handle(page, "Alpha")).toHaveAttribute(
				"aria-pressed",
				"true",
			);
			await page.keyboard.press("Escape");
			await expect(handle(page, "Alpha")).not.toHaveAttribute("aria-pressed");
		}
	});
}

test("a completed or canceled drag swallows only its own click", async ({
	page,
	browserName,
}) => {
	test.skip(
		browserName !== "chromium",
		"One browser is enough to pin the suppression window; the rule is not engine specific.",
	);
	const layout = seededLayout();
	layout.bookmarks.push({
		_id: "delta",
		_creationTime: 4,
		title: "Delta",
		url: "#delta",
		tags: ["pinned"],
		padPosition: 1,
		projects: [],
	});
	await openLaunch(page, { layout });
	const gammaLink = page.locator(
		'[data-drop-zone="pinned"] > [data-sort-id="gamma"] a.pin',
	);
	const deltaRow = page.locator(
		'[data-drop-zone="pinned"] > [data-sort-id="delta"]',
	);

	// A same-zone reorder keeps the dragged identity in place, which is exactly
	// where a stale suppression flag would swallow the next genuine click.
	const deltaBox = await deltaRow.boundingBox();
	if (!deltaBox) throw new Error("Expected a visible Delta row");
	await drag(page, handle(page, "Gamma"), deltaRow, {
		y: deltaBox.height / 2 - 2,
	});
	await expect.poll(() => padOrder(page, "pinned")).toEqual(["delta", "gamma"]);
	expect(new URL(page.url()).hash).toBe("");
	await page.evaluate(() => window.__launchFixture.resolveNext());

	await gammaLink.click();
	await expect(page).toHaveURL(/#gamma$/);
	expect(
		await page.evaluate(() =>
			window.__launchFixture.calls
				.filter((call) => call.name === "launch:click")
				.map((call) => call.args.id),
		),
	).toEqual(["gamma"]);

	const from = await center(handle(page, "Delta"));
	const to = await center(
		page.locator('[data-drop-zone="top"] > [data-sort-id="beta"]'),
	);
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(from.x + 8, from.y + 8);
	await page.mouse.move(to.x, to.y, { steps: 4 });
	await expect(page.locator(".launch-drag-overlay")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.locator(".launch-drag-overlay")).toHaveCount(0);
	await page.mouse.up();
	expect(await padOrder(page, "pinned")).toEqual(["delta", "gamma"]);
	expect(await padOrder(page, "top")).toEqual(["alpha", "beta"]);

	await page
		.locator('[data-drop-zone="pinned"] > [data-sort-id="delta"] a.pin')
		.click();
	await expect(page).toHaveURL(/#delta$/);
	expect(
		await page.evaluate(() =>
			window.__launchFixture.calls
				.filter((call) => call.name === "launch:click")
				.map((call) => call.args.id),
		),
	).toEqual(["gamma", "delta"]);
});

test("project gap targeting never covers project tile links", async ({
	page,
}) => {
	await openLaunch(page);
	const tileLink = page.locator(
		'[data-drop-zone="project:one"] > [data-sort-id="alpha"] a.tile',
	);
	const box = await tileLink.boundingBox();
	if (!box) throw new Error("Expected a visible project tile");
	const probe = { x: box.x + box.width / 2, y: box.y + box.height - 3 };
	expect(
		await page.evaluate(({ x, y }) => {
			const element = document.elementFromPoint(x, y);
			return {
				gap: Boolean(element?.closest(".project-gap")),
				title: element?.closest("a")?.title ?? null,
			};
		}, probe),
	).toEqual({ gap: false, title: "Alpha prod" });
	await page.mouse.click(probe.x, probe.y);
	await expect(page).toHaveURL(/#alpha$/);

	const from = await center(
		page.getByRole("button", { name: "Move One project", exact: true }),
	);
	const gap = await center(
		page.locator('#projects > .project-gap[data-position="2"]'),
	);
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(from.x + 8, from.y);
	await expect(page.locator(".launch-drag-overlay")).toBeVisible();
	for (const offset of [-8, 0, 8]) {
		await page.mouse.move(gap.x, gap.y + offset, { steps: 3 });
		await expect
			.poll(() =>
				page.evaluate(() => window.launchDndController.getState().target),
			)
			.toEqual({ valid: true, zone: "project-list", index: 2 });
	}
	await expect(page.locator("#projects > .launch-drop-rule")).toHaveCSS(
		"height",
		"2px",
	);
	await page.mouse.up();
	await expect
		.poll(() =>
			page
				.locator('#projects > [data-sort-kind="project"]')
				.evaluateAll((nodes) => nodes.map((node) => node.dataset.sortId)),
		)
		.toEqual(["two", "one", "empty"]);
});

test("rerenders keep a focused link a link and drops expose a visible handle", async ({
	page,
}) => {
	await openLaunch(page);
	const alphaLink = page.locator(
		'#pad [data-drop-zone="top"] > [data-sort-id="alpha"] a.tile',
	);
	await alphaLink.focus();
	const remote = seededLayout();
	remote.version = 8;
	remote.bookmarks[1].title = "Remote Beta";
	await page.evaluate(
		(snapshot) => window.__launchFixture.publish(snapshot),
		remote,
	);
	await expect(page.locator("#pad").getByTitle("Remote Beta")).toBeVisible();
	expect(
		await page.evaluate(() => ({
			tag: document.activeElement?.tagName,
			handle: document.activeElement?.hasAttribute("data-drag-handle"),
			sortId:
				document.activeElement?.closest("[data-sort-id]")?.dataset.sortId ??
				null,
		})),
	).toEqual({ tag: "A", handle: false, sortId: "alpha" });

	await drag(
		page,
		handle(page, "Alpha"),
		page.locator('[data-drop-zone="pinned"] > [data-sort-id="gamma"]'),
		{ y: -8 },
	);
	await expect.poll(() => padOrder(page, "pinned")).toEqual(["alpha", "gamma"]);
	await page.mouse.move(0, 0);
	const movedHandle = page.locator(
		'#pad [data-drop-zone="pinned"] > [data-sort-id="alpha"] [data-drag-handle]',
	);
	await expect(movedHandle).toBeFocused();
	await expect(movedHandle).toHaveCSS("opacity", "1");
	await expect(movedHandle).toHaveCSS("outline-width", "2px");
	expect(
		await page.evaluate(() => document.activeElement?.matches(":focus")),
	).toBe(true);
});
