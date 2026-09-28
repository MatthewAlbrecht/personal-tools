import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML } from "linkedom";

import {
	eligibleDropLists,
	initializeLaunchDnd,
	operationFromDrop,
} from "./launch-dnd.mjs";

function fixture() {
	const { document, window } = parseHTML(`
		<main id="pad">
			<div data-sort-kind="bookmark" data-sort-id="bookmark-1" data-zone="top">
				<button data-drag-handle data-sort-kind="bookmark" data-sort-id="bookmark-1" data-zone="top"></button>
			</div>
		</main>
		<aside id="projects">
			<section data-sort-kind="project" data-sort-id="project-1" data-zone="projects" data-position="0">
				<button data-drag-handle data-sort-kind="project" data-sort-id="project-1" data-zone="projects"></button>
			</section>
		</aside>
		<div id="outside"><button data-drag-handle></button></div>
	`);
	window.requestAnimationFrame = () => 1;
	window.cancelAnimationFrame = () => {};
	Object.defineProperty(document, "activeElement", {
		configurable: true,
		writable: true,
		value: null,
	});
	for (const element of document.querySelectorAll(
		"button, #pad-heading, #pad",
	)) {
		element.focus = function focus() {
			document.activeElement = element;
		};
	}
	return { document, window };
}

test("initialization is idempotent and delegates only on launch roots", () => {
	const { document, window } = fixture();
	const pad = document.getElementById("pad");
	const projects = document.getElementById("projects");
	const calls = [];
	const options = {
		document,
		window,
		pad,
		projects,
		onPointerDown(event) {
			calls.push(["pointer", event.currentTarget.id]);
		},
		onKeyDown(event) {
			calls.push(["key", event.currentTarget.id]);
		},
	};

	const first = initializeLaunchDnd(options);
	assert.equal(initializeLaunchDnd(options), first);

	pad.firstElementChild.dispatchEvent(
		new window.Event("pointerdown", { bubbles: true }),
	);
	projects.firstElementChild.dispatchEvent(
		new window.Event("keydown", { bubbles: true }),
	);
	document
		.querySelector("#outside button")
		.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
	assert.deepEqual(calls, [
		["pointer", "pad"],
		["key", "projects"],
	]);

	first.destroy();
	pad.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
	projects.dispatchEvent(new window.Event("keydown", { bubbles: true }));
	assert.equal(calls.length, 2);
});

test("destroy is safe repeatedly and permits clean reinitialization", () => {
	const { document, window } = fixture();
	const options = {
		document,
		window,
		pad: document.getElementById("pad"),
		projects: document.getElementById("projects"),
	};
	const first = initializeLaunchDnd(options);
	first.destroy();
	first.destroy();
	assert.equal(first.getState().destroyed, true);

	const second = initializeLaunchDnd(options);
	assert.notEqual(second, first);
	assert.equal(second.getState().destroyed, false);
	second.destroy();
});

test("render hooks cancel and restore focus without perpetuating pending markers", () => {
	const { document, window } = fixture();
	const pad = document.getElementById("pad");
	const projects = document.getElementById("projects");
	const handle = pad.querySelector("[data-drag-handle]");
	handle.closest("[data-sort-kind]").dataset.pending = "true";
	let cancelCalls = 0;
	Object.defineProperty(document, "activeElement", {
		configurable: true,
		writable: true,
		value: handle,
	});
	const controller = initializeLaunchDnd({
		document,
		window,
		pad,
		projects,
		onCancel() {
			cancelCalls += 1;
		},
	});

	controller.beforeRender();
	assert.equal(cancelCalls, 1);
	assert.deepEqual(controller.getState().focusIdentity, {
		sortKind: "bookmark",
		sortId: "bookmark-1",
		zone: "top",
	});

	const replacement = document.createElement("div");
	replacement.dataset.sortKind = "bookmark";
	replacement.dataset.sortId = "bookmark-1";
	replacement.dataset.zone = "top";
	const replacementHandle = document.createElement("button");
	replacementHandle.dataset.dragHandle = "";
	replacementHandle.dataset.sortKind = "bookmark";
	replacementHandle.dataset.sortId = "bookmark-1";
	replacementHandle.dataset.zone = "top";
	replacementHandle.focus = function focus() {
		document.activeElement = replacementHandle;
	};
	replacement.append(replacementHandle);
	pad.replaceChildren(replacement);
	controller.afterRender();

	assert.equal(document.activeElement, replacementHandle);
	assert.equal(replacement.dataset.pending, undefined);
	assert.equal("pendingIdentities" in controller.getState(), false);
	assert.equal(controller.getState().focusIdentity, null);
	controller.destroy();
});

test("beforeRender captures focus identity before cancellation changes focus", () => {
	const { document, window } = fixture();
	const pad = document.getElementById("pad");
	const handle = pad.querySelector("[data-drag-handle]");
	const outside = document.querySelector("#outside button");
	Object.defineProperty(document, "activeElement", {
		configurable: true,
		writable: true,
		value: handle,
	});
	const controller = initializeLaunchDnd({
		document,
		window,
		pad,
		projects: document.getElementById("projects"),
		onCancel() {
			document.activeElement = outside;
		},
	});

	controller.beforeRender();
	assert.deepEqual(controller.getState().focusIdentity, {
		sortKind: "bookmark",
		sortId: "bookmark-1",
		zone: "top",
	});
	controller.destroy();
});

test("focus capture ignores matching nodes outside roots", () => {
	const { document, window } = fixture();
	const outside = document.querySelector("#outside button");
	outside.parentElement.dataset.sortKind = "bookmark";
	outside.parentElement.dataset.sortId = "bookmark-1";
	outside.parentElement.dataset.zone = "top";
	outside.parentElement.dataset.pending = "true";
	Object.defineProperty(document, "activeElement", {
		configurable: true,
		writable: true,
		value: outside,
	});
	const controller = initializeLaunchDnd({
		document,
		window,
		pad: document.getElementById("pad"),
		projects: document.getElementById("projects"),
	});

	controller.beforeRender();
	assert.equal(controller.getState().focusIdentity, null);
	controller.destroy();
});

test("optional measurement is deferred through idle callback with timeout", () => {
	const { document, window } = fixture();
	const idleCalls = [];
	let measured = false;
	window.requestIdleCallback = (callback, options) => {
		idleCalls.push({ callback, options });
		return 1;
	};
	const controller = initializeLaunchDnd({
		document,
		window,
		pad: document.getElementById("pad"),
		projects: document.getElementById("projects"),
		measure() {
			measured = true;
		},
	});

	assert.equal(measured, false);
	assert.equal(idleCalls[0].options.timeout, 500);
	idleCalls[0].callback();
	assert.equal(measured, true);
	controller.destroy();
});

test("mouse pickup requires primary button and more than four pixels", () => {
	const { document, window } = fixture();
	const pad = document.getElementById("pad");
	const handle = pad.querySelector("[data-drag-handle]");
	const captures = [];
	handle.setPointerCapture = (id) => captures.push(id);
	const frames = [];
	window.requestAnimationFrame = (callback) => {
		frames.push(callback);
		return frames.length;
	};
	const controller = initializeLaunchDnd({
		document,
		window,
		pad,
		projects: document.getElementById("projects"),
	});

	handle.dispatchEvent(
		pointerEvent(window, "pointerdown", { button: 1, pointerId: 1 }),
	);
	assert.equal(controller.getState().phase, "idle");
	handle.dispatchEvent(
		pointerEvent(window, "pointerdown", { button: 0, pointerId: 2 }),
	);
	assert.equal(controller.getState().phase, "pressed");
	assert.deepEqual(captures, [2]);
	document.dispatchEvent(
		pointerEvent(window, "pointermove", { clientX: 4, pointerId: 2 }),
	);
	assert.equal(controller.getState().phase, "pressed");
	document.dispatchEvent(
		pointerEvent(window, "pointermove", { clientX: 5, pointerId: 2 }),
	);
	assert.equal(controller.getState().phase, "dragging");
	assert.ok(document.querySelector(".launch-drag-overlay"));
	controller.destroy();
});

test("central pickup blocking rejects pointer and keyboard pickup", () => {
	const { document, window } = fixture();
	const pad = document.getElementById("pad");
	const handle = pad.querySelector("[data-drag-handle]");
	const controller = initializeLaunchDnd({
		document,
		window,
		pad,
		projects: document.getElementById("projects"),
		isPickupBlocked() {
			return true;
		},
	});

	handle.dispatchEvent(pointerEvent(window, "pointerdown", { pointerId: 40 }));
	assert.equal(controller.getState().phase, "idle");
	const keyboard = keyEvent(window, "Enter");
	handle.dispatchEvent(keyboard);
	assert.equal(controller.getState().phase, "idle");
	assert.equal(keyboard.defaultPrevented, false);
	controller.destroy();
});

test("reduced motion skips lift and FLIP while using fixed autoscroll steps", () => {
	const { document, window } = parseHTML(`
		<div id="scroller" style="overflow-y: auto">
			<main id="pad">
				<div class="top-grid" data-drop-list="bookmarks" data-drop-zone="top">
					<div data-sort-kind="bookmark" data-sort-id="one" data-zone="top">
						<button data-drag-handle data-sort-kind="bookmark" data-sort-id="one" data-zone="top"></button>
					</div>
					<div data-sort-kind="bookmark" data-sort-id="two" data-zone="top"></div>
				</div>
			</main>
		</div>
		<aside id="projects"></aside>
		<p id="launch-dnd-live"></p>
	`);
	const media = {
		matches: true,
		addEventListener() {},
		removeEventListener() {},
	};
	const scroller = document.getElementById("scroller");
	Object.defineProperties(scroller, {
		clientHeight: { configurable: true, value: 200 },
		scrollHeight: { configurable: true, value: 600 },
	});
	scroller.getBoundingClientRect = () => rect(0, 0, 300, 200);
	window.getComputedStyle = () => ({ overflowY: "auto" });
	const source = document.querySelector("[data-sort-id='one']");
	const sibling = document.querySelector("[data-sort-id='two']");
	source.getBoundingClientRect = () => rect(0, 100, 44, 40);
	sibling.getBoundingClientRect = () => rect(0, 0, 44, 40);
	let animations = 0;
	sibling.animate = () => {
		animations += 1;
	};
	const scrolls = [];
	scroller.scrollBy = (_x, y) => scrolls.push(y);
	document.elementsFromPoint = () => [
		sibling,
		document.querySelector("[data-drop-zone='top']"),
	];
	const frames = [];
	window.requestAnimationFrame = (callback) => {
		frames.push(callback);
		return frames.length;
	};
	window.cancelAnimationFrame = () => {};
	const controller = initializeLaunchDnd({
		document,
		window,
		pad: document.getElementById("pad"),
		projects: document.getElementById("projects"),
		matchMedia() {
			return media;
		},
	});

	source
		.querySelector("button")
		.dispatchEvent(pointerEvent(window, "pointerdown", { pointerId: 41 }));
	document.dispatchEvent(
		pointerEvent(window, "pointermove", {
			clientX: 10,
			clientY: 199,
			pointerId: 41,
		}),
	);
	document.dispatchEvent(
		pointerEvent(window, "pointermove", {
			clientX: 10,
			clientY: 199,
			pointerId: 41,
		}),
	);
	assert.equal(
		document.querySelector(".launch-drag-overlay").style.translate,
		undefined,
	);
	assert.equal(animations, 0);
	while (scrolls.length === 0 && frames.length > 0) frames.shift()();
	assert.equal(scrolls[0], 10);
	assert.ok(document.querySelector(".launch-drop-slot"));
	controller.destroy();
});

test("enabling reduced motion at runtime cancels FLIP and strips overlay motion immediately", () => {
	const { document, window } = parseHTML(`
		<main id="pad">
			<div class="top-grid" data-drop-list="bookmarks" data-drop-zone="top">
				<div data-sort-kind="bookmark" data-sort-id="one" data-zone="top">
					<button data-drag-handle data-sort-kind="bookmark" data-sort-id="one" data-zone="top"></button>
				</div>
				<div data-sort-kind="bookmark" data-sort-id="two" data-zone="top"></div>
			</div>
		</main>
		<aside id="projects"></aside>
	`);
	let mediaListener;
	const media = {
		matches: false,
		addEventListener(_type, listener) {
			mediaListener = listener;
		},
		removeEventListener() {},
	};
	window.requestAnimationFrame = () => 1;
	window.cancelAnimationFrame = () => {};
	const source = document.querySelector("[data-sort-id='one']");
	const sibling = document.querySelector("[data-sort-id='two']");
	const list = document.querySelector("[data-drop-zone='top']");
	source.getBoundingClientRect = () => rect(0, 0, 44, 40);
	sibling.getBoundingClientRect = () =>
		source.nextElementSibling === sibling
			? rect(50, 0, 44, 40)
			: rect(0, 0, 44, 40);
	let canceled = 0;
	sibling.animate = () => ({
		cancel() {
			canceled += 1;
		},
	});
	document.elementsFromPoint = () => [sibling, list];
	const controller = initializeLaunchDnd({
		document,
		window,
		pad: document.getElementById("pad"),
		projects: document.getElementById("projects"),
		matchMedia() {
			return media;
		},
	});

	source
		.querySelector("button")
		.dispatchEvent(pointerEvent(window, "pointerdown", { pointerId: 42 }));
	document.dispatchEvent(
		pointerEvent(window, "pointermove", {
			clientX: 60,
			clientY: 10,
			pointerId: 42,
		}),
	);
	const overlay = document.querySelector(".launch-drag-overlay");
	assert.equal(overlay.style.translate, "0 -2px");

	mediaListener({ matches: true });
	assert.equal(canceled, 1);
	assert.equal(overlay.style.translate, "none");
	assert.equal(overlay.style.transition, "none");
	assert.equal(overlay.style.animation, "none");
	assert.ok(document.querySelector(".launch-drop-slot"));
	assert.equal(controller.getState().phase, "dragging");
	controller.destroy();
});

test("right-click, short click, and activated drag preserve their distinct DOM behavior", () => {
	const { document, window } = parseHTML(`
		<main id="pad">
			<div class="top-grid" data-drop-list="bookmarks" data-drop-zone="top">
				<div data-sort-kind="bookmark" data-sort-id="one" data-zone="top">
					<button data-drag-handle data-sort-kind="bookmark" data-sort-id="one" data-zone="top"></button>
					<a href="/destination">One</a>
				</div>
			</div>
			<button id="unrelated">Unrelated</button>
		</main>
		<aside id="projects"></aside>
	`);
	window.requestAnimationFrame = () => 1;
	window.cancelAnimationFrame = () => {};
	Object.defineProperty(document, "activeElement", {
		configurable: true,
		writable: true,
		value: null,
	});
	const handle = document.querySelector("button");
	const anchor = document.querySelector("a");
	const source = handle.parentElement;
	handle.focus = () => {
		document.activeElement = handle;
	};
	source.getBoundingClientRect = () => rect(0, 0, 44, 40);
	let menus = 0;
	let clicks = 0;
	source.addEventListener("contextmenu", (event) => {
		event.preventDefault();
		menus += 1;
	});
	const controller = initializeLaunchDnd({
		document,
		window,
		pad: document.getElementById("pad"),
		projects: document.getElementById("projects"),
	});
	document.addEventListener("click", () => {
		clicks += 1;
	});

	handle.dispatchEvent(
		pointerEvent(window, "pointerdown", { button: 2, pointerId: 1 }),
	);
	handle.dispatchEvent(
		new window.Event("contextmenu", { bubbles: true, cancelable: true }),
	);
	assert.equal(menus, 1);
	assert.equal(controller.getState().phase, "idle");

	handle.dispatchEvent(pointerEvent(window, "pointerdown", { pointerId: 2 }));
	document.dispatchEvent(pointerEvent(window, "pointerup", { pointerId: 2 }));
	assert.equal(document.activeElement, handle);
	assert.equal(clicks, 0);

	handle.dispatchEvent(pointerEvent(window, "pointerdown", { pointerId: 3 }));
	document.dispatchEvent(
		pointerEvent(window, "pointermove", { clientX: 5, pointerId: 3 }),
	);
	document.dispatchEvent(pointerEvent(window, "pointerup", { pointerId: 3 }));
	const click = new window.Event("click", { bubbles: true, cancelable: true });
	anchor.dispatchEvent(click);
	assert.equal(click.defaultPrevented, true);
	assert.equal(clicks, 0);

	handle.dispatchEvent(pointerEvent(window, "pointerdown", { pointerId: 4 }));
	document.dispatchEvent(
		pointerEvent(window, "pointermove", { clientX: 5, pointerId: 4 }),
	);
	document.dispatchEvent(pointerEvent(window, "pointerup", { pointerId: 4 }));
	const dragClick = new window.Event("click", {
		bubbles: true,
		cancelable: true,
	});
	document.getElementById("unrelated").dispatchEvent(dragClick);
	assert.equal(dragClick.defaultPrevented, false);
	assert.equal(clicks, 1);

	const nextClick = new window.Event("click", {
		bubbles: true,
		cancelable: true,
	});
	anchor.dispatchEvent(nextClick);
	assert.equal(nextClick.defaultPrevented, false);
	assert.equal(clicks, 2);
	controller.destroy();
});

test("touch pickup waits 250ms, tolerates eight pixels, and vibrates once", () => {
	const { document, window } = fixture();
	const pad = document.getElementById("pad");
	const handle = pad.querySelector("[data-drag-handle]");
	handle.setPointerCapture = () => {};
	const timers = [];
	window.setTimeout = (callback, delay) => {
		timers.push({ callback, delay });
		return timers.length;
	};
	window.clearTimeout = () => {};
	const vibrations = [];
	const navigator = {
		vibrate(duration) {
			vibrations.push(duration);
		},
	};
	const controller = initializeLaunchDnd({
		document,
		window,
		pad,
		projects: document.getElementById("projects"),
		navigator,
	});

	handle.dispatchEvent(
		pointerEvent(window, "pointerdown", {
			pointerId: 3,
			pointerType: "touch",
		}),
	);
	assert.equal(timers[0].delay, 250);
	document.dispatchEvent(
		pointerEvent(window, "pointermove", {
			clientX: 8,
			pointerId: 3,
			pointerType: "touch",
		}),
	);
	timers[0].callback();
	assert.equal(controller.getState().phase, "dragging");
	assert.deepEqual(vibrations, [10]);
	controller.destroy();
});

test("drag resolves targets with elementsFromPoint and marks invalid transitions", () => {
	const { document, window } = fixture();
	const pad = document.getElementById("pad");
	const handle = pad.querySelector("[data-drag-handle]");
	const sortable = handle.closest("[data-sort-kind]");
	sortable.getBoundingClientRect = () => ({
		left: 0,
		top: 0,
		right: 44,
		bottom: 40,
		width: 44,
		height: 40,
	});
	handle.setPointerCapture = () => {};
	window.requestAnimationFrame = (callback) => {
		callback();
		return 1;
	};
	let hitCalls = 0;
	document.elementsFromPoint = () => {
		hitCalls += 1;
		return [];
	};
	const live = document.createElement("p");
	live.id = "launch-dnd-live";
	document.body.append(live);
	const controller = initializeLaunchDnd({
		document,
		window,
		pad,
		projects: document.getElementById("projects"),
	});

	handle.dispatchEvent(pointerEvent(window, "pointerdown", { pointerId: 4 }));
	document.dispatchEvent(
		pointerEvent(window, "pointermove", {
			clientX: 6,
			clientY: 100,
			pointerId: 4,
		}),
	);
	document.dispatchEvent(
		pointerEvent(window, "pointermove", {
			clientX: 20,
			clientY: 100,
			pointerId: 4,
		}),
	);
	assert.ok(hitCalls >= 1);
	assert.equal(
		document.querySelector(".launch-drag-overlay").style.opacity,
		"0.55",
	);
	assert.equal(live.textContent, "Can’t drop here.");
	controller.cancel();
	assert.equal(document.querySelector(".launch-drag-overlay"), null);
	assert.equal(controller.getState().phase, "idle");
	controller.destroy();
});

test("cancellation paths restore placeholder and stop active drag", () => {
	for (const eventName of [
		"pointercancel",
		"lostpointercapture",
		"blur",
		"visibilitychange",
	]) {
		const { document, window } = fixture();
		const pad = document.getElementById("pad");
		const handle = pad.querySelector("[data-drag-handle]");
		handle.setPointerCapture = () => {};
		const controller = initializeLaunchDnd({
			document,
			window,
			pad,
			projects: document.getElementById("projects"),
		});
		handle.dispatchEvent(pointerEvent(window, "pointerdown", { pointerId: 5 }));
		document.dispatchEvent(
			pointerEvent(window, "pointermove", { clientX: 5, pointerId: 5 }),
		);
		if (eventName === "blur") {
			window.dispatchEvent(new window.Event("blur"));
		} else if (eventName === "visibilitychange") {
			Object.defineProperty(document, "hidden", {
				configurable: true,
				value: true,
			});
			document.dispatchEvent(new window.Event("visibilitychange"));
		} else {
			document.dispatchEvent(pointerEvent(window, eventName, { pointerId: 5 }));
		}
		assert.equal(controller.getState().phase, "idle");
		assert.equal(document.querySelector(".launch-drag-placeholder"), null);
		controller.destroy();
	}
});

test("touch declares pan-y before contact and captures only after stationary activation", () => {
	const { document, window } = fixture();
	const pad = document.getElementById("pad");
	const handle = pad.querySelector("[data-drag-handle]");
	handle.style.touchAction = "pan-y";
	const captures = [];
	handle.setPointerCapture = (id) => captures.push(id);
	const timers = [];
	window.setTimeout = (callback, delay) => {
		timers.push({ callback, delay });
		return timers.length;
	};
	window.clearTimeout = () => {};
	const controller = initializeLaunchDnd({
		document,
		window,
		pad,
		projects: document.getElementById("projects"),
	});

	handle.dispatchEvent(
		pointerEvent(window, "pointerdown", {
			pointerId: 20,
			pointerType: "touch",
		}),
	);
	assert.deepEqual(captures, []);
	assert.equal(handle.style.touchAction, "pan-y");
	timers[0].callback();
	assert.deepEqual(captures, [20]);
	assert.equal(handle.style.touchAction, "pan-y");
	const activeMove = pointerEvent(window, "pointermove", {
		clientX: 4,
		pointerId: 20,
		pointerType: "touch",
	});
	document.dispatchEvent(activeMove);
	assert.equal(activeMove.defaultPrevented, true);
	assert.equal(controller.getState().phase, "dragging");
	controller.cancel();
	assert.equal(handle.style.touchAction, "pan-y");
	controller.destroy();
});

test("active touch drag claims touchmove so the browser cannot pan it away", () => {
	const { document, window } = fixture();
	const pad = document.getElementById("pad");
	const handle = pad.querySelector("[data-drag-handle]");
	handle.setPointerCapture = () => {};
	const timers = [];
	window.setTimeout = (callback) => {
		timers.push(callback);
		return timers.length;
	};
	window.clearTimeout = () => {};
	const controller = initializeLaunchDnd({
		document,
		window,
		pad,
		projects: document.getElementById("projects"),
	});
	function touchMove() {
		const event = new window.Event("touchmove", {
			bubbles: true,
			cancelable: true,
		});
		document.dispatchEvent(event);
		return event.defaultPrevented;
	}

	assert.equal(touchMove(), false);
	handle.dispatchEvent(
		pointerEvent(window, "pointerdown", {
			pointerId: 30,
			pointerType: "touch",
		}),
	);
	assert.equal(touchMove(), false);
	timers[0]();
	assert.equal(controller.getState().phase, "dragging");
	assert.equal(touchMove(), true);
	controller.cancel();
	assert.equal(touchMove(), false);
	controller.destroy();
});

test("grid slot resolution uses row geometry before horizontal position", () => {
	const { document, window } = parseHTML(`
		<main id="pad">
			<div class="top-grid" data-drop-list="bookmarks" data-drop-zone="top">
				<div data-sort-kind="bookmark" data-sort-id="source" data-zone="top">
					<button data-drag-handle data-sort-kind="bookmark" data-sort-id="source" data-zone="top"></button>
				</div>
				<div data-sort-kind="bookmark" data-sort-id="tall" data-zone="top"></div>
				<div data-sort-kind="bookmark" data-sort-id="short" data-zone="top"></div>
				<div data-sort-kind="bookmark" data-sort-id="next-row" data-zone="top"></div>
			</div>
		</main>
		<aside id="projects"></aside>
	`);
	window.requestAnimationFrame = () => 1;
	window.cancelAnimationFrame = () => {};
	const list = document.querySelector(".top-grid");
	const source = list.children[0];
	const [tall, short, nextRow] = [...list.children].slice(1);
	source.getBoundingClientRect = () => rect(0, 0, 44, 40);
	tall.getBoundingClientRect = () => rect(0, 0, 100, 100);
	short.getBoundingClientRect = () => rect(110, 0, 100, 40);
	nextRow.getBoundingClientRect = () => rect(0, 110, 100, 40);
	document.elementsFromPoint = () => [list];
	const controller = initializeLaunchDnd({
		document,
		window,
		pad: document.getElementById("pad"),
		projects: document.getElementById("projects"),
	});

	source
		.querySelector("button")
		.dispatchEvent(pointerEvent(window, "pointerdown", { pointerId: 27 }));
	document.dispatchEvent(
		pointerEvent(window, "pointermove", {
			clientX: 10,
			clientY: 90,
			pointerId: 27,
		}),
	);
	assert.equal(controller.getState().target.index, 2);
	controller.destroy();
});

test("second pointers are ignored throughout an active session", () => {
	const { document, window } = fixture();
	const pad = document.getElementById("pad");
	const handle = pad.querySelector("[data-drag-handle]");
	const controller = initializeLaunchDnd({
		document,
		window,
		pad,
		projects: document.getElementById("projects"),
	});

	handle.dispatchEvent(pointerEvent(window, "pointerdown", { pointerId: 21 }));
	handle.dispatchEvent(pointerEvent(window, "pointerdown", { pointerId: 22 }));
	document.dispatchEvent(
		pointerEvent(window, "pointermove", {
			clientX: 10,
			pointerId: 22,
		}),
	);
	assert.equal(controller.getState().phase, "pressed");
	document.dispatchEvent(
		pointerEvent(window, "pointermove", {
			clientX: 10,
			pointerId: 21,
		}),
	);
	assert.equal(controller.getState().phase, "dragging");
	controller.destroy();
});

test("same-zone pickup leaves only the origin hole until another item is hovered", () => {
	const { document, window } = parseHTML(`
		<main id="pad"></main>
		<aside id="projects">
			<div class="top-grid" data-drop-list="bookmarks" data-drop-zone="project:p1">
				<div data-sort-kind="bookmark" data-sort-id="one" data-zone="project:p1" data-position="0">
					<button data-drag-handle data-sort-kind="bookmark" data-sort-id="one" data-zone="project:p1"></button>
					<span class="mark"></span>
				</div>
				<div data-sort-kind="bookmark" data-sort-id="two" data-zone="project:p1" data-position="1">
					<button data-drag-handle data-sort-kind="bookmark" data-sort-id="two" data-zone="project:p1"></button>
				</div>
			</div>
		</aside>
	`);
	window.requestAnimationFrame = () => 1;
	window.cancelAnimationFrame = () => {};
	const list = document.querySelector("[data-drop-list='bookmarks']");
	const source = list.children[0];
	const sibling = list.children[1];
	source.getBoundingClientRect = () => rect(0, 0, 44, 40);
	sibling.getBoundingClientRect = () => rect(50, 0, 44, 40);
	document.elementsFromPoint = () => [list];
	const controller = initializeLaunchDnd({
		document,
		window,
		pad: document.getElementById("pad"),
		projects: document.getElementById("projects"),
	});

	source
		.querySelector("button")
		.dispatchEvent(pointerEvent(window, "pointerdown", { pointerId: 31 }));
	document.dispatchEvent(
		pointerEvent(window, "pointermove", {
			clientX: 6,
			clientY: 20,
			pointerId: 31,
		}),
	);

	assert.equal(controller.getState().phase, "dragging");
	assert.ok(list.querySelector(".launch-drag-placeholder"));
	assert.equal(list.querySelector(".launch-drop-slot"), null);
	assert.deepEqual(
		[...list.children]
			.filter((element) => element.dataset.sortKind === "bookmark")
			.map((element) => element.dataset.sortId),
		["one", "two"],
	);
	assert.deepEqual(
		[...list.children]
			.filter((element) => element.style.display !== "none")
			.map((element) => element.className || element.dataset.sortId),
		["launch-drag-placeholder", "two"],
	);
	controller.destroy();
});

test("bookmark preview moves the live node, animates siblings, and cancel restores origin", () => {
	const { document, window } = parseHTML(`
		<main id="pad">
			<div class="top-grid" data-drop-list="bookmarks" data-drop-zone="top">
				<div data-sort-kind="bookmark" data-sort-id="one" data-zone="top">
					<button data-drag-handle data-sort-kind="bookmark" data-sort-id="one" data-zone="top"></button>
					<span class="mark" style="width: 16px; height: 16px"></span>
				</div>
				<div data-sort-kind="bookmark" data-sort-id="two" data-zone="top">
					<button data-drag-handle data-sort-kind="bookmark" data-sort-id="two" data-zone="top"></button>
				</div>
			</div>
		</main>
		<aside id="projects"></aside>
	`);
	window.requestAnimationFrame = () => 1;
	window.cancelAnimationFrame = () => {};
	const pad = document.getElementById("pad");
	const list = pad.firstElementChild;
	const source = list.children[0];
	const sibling = list.children[1];
	const animations = [];
	source.getBoundingClientRect = () => rect(0, 0, 44, 40);
	sibling.getBoundingClientRect = () =>
		source.nextElementSibling === sibling
			? rect(0, 0, 44, 40)
			: rect(50, 0, 44, 40);
	sibling.animate = (frames, options) => animations.push({ frames, options });
	document.elementsFromPoint = () => [sibling, list];
	const controller = initializeLaunchDnd({
		document,
		window,
		pad,
		projects: document.getElementById("projects"),
	});

	source
		.querySelector("button")
		.dispatchEvent(pointerEvent(window, "pointerdown", { pointerId: 23 }));
	document.dispatchEvent(
		pointerEvent(window, "pointermove", {
			clientX: 60,
			clientY: 30,
			pointerId: 23,
		}),
	);
	assert.equal(source.parentElement, list);
	assert.deepEqual(
		[...list.children]
			.filter((element) => element.dataset.sortKind === "bookmark")
			.map((element) => element.dataset.sortId),
		["two", "one"],
		list.innerHTML,
	);
	assert.equal(list.dataset.dndReceiving, "true");
	assert.ok(list.querySelector(".launch-drop-slot"));
	assert.deepEqual(animations.at(-1).options, {
		duration: 120,
		easing: "cubic-bezier(.2,.8,.2,1)",
	});
	const overlayMark = document.querySelector(".launch-drag-overlay .mark");
	assert.equal(overlayMark.style.width, "22px");
	assert.equal(overlayMark.style.height, "22px");
	assert.equal(
		document.querySelector(".launch-drag-overlay").style.translate,
		"0 -2px",
	);

	controller.cancel();
	assert.equal(list.firstElementChild, source);
	assert.equal(source.style.visibility || "", "");
	assert.equal(document.querySelector(".launch-drop-slot"), null);
	assert.equal(list.hasAttribute("data-dnd-receiving"), false);
	controller.destroy();
});

test("project pickup creates a measured origin placeholder, compact overlay, and rule", () => {
	const { document, window } = parseHTML(`
		<main id="pad"></main>
		<aside id="projects" data-drop-list="projects">
			<div class="project-gap" data-drop-zone="project-list" data-position="0"></div>
			<section data-sort-kind="project" data-sort-id="project-1" data-zone="projects">
				<div><button data-drag-handle data-sort-kind="project" data-sort-id="project-1" data-zone="projects"></button><h2>First project</h2></div>
			</section>
			<div class="project-gap" data-drop-zone="project-list" data-position="1"></div>
		</aside>
	`);
	window.requestAnimationFrame = () => 1;
	window.cancelAnimationFrame = () => {};
	const projects = document.getElementById("projects");
	const source = projects.querySelector("section");
	source.getBoundingClientRect = () => rect(0, 10, 200, 80);
	projects.getBoundingClientRect = () => rect(0, 0, 200, 200);
	projects.firstElementChild.getBoundingClientRect = () => rect(0, 0, 200, 2);
	projects.lastElementChild.getBoundingClientRect = () => rect(0, 95, 200, 2);
	const drops = [];
	const controller = initializeLaunchDnd({
		document,
		window,
		pad: document.getElementById("pad"),
		projects,
		onDrop(operation) {
			drops.push(operation);
		},
	});
	source
		.querySelector("button")
		.dispatchEvent(pointerEvent(window, "pointerdown", { pointerId: 24 }));
	document.dispatchEvent(
		pointerEvent(window, "pointermove", {
			clientX: 10,
			clientY: 100,
			pointerId: 24,
		}),
	);
	const overlay = document.querySelector(".launch-drag-project-overlay");
	assert.equal(overlay.textContent, "First project");
	assert.ok(projects.querySelector(".launch-drop-rule"));
	const placeholder = document.querySelector(".launch-drag-placeholder");
	assert.equal(placeholder.style.width, "200px");
	assert.equal(placeholder.style.height, "80px");
	assert.equal(placeholder.dataset.placeholderKind, "project");
	assert.equal(
		source.previousElementSibling.previousElementSibling.className,
		"project-gap",
	);
	document.dispatchEvent(pointerEvent(window, "pointerup", { pointerId: 24 }));
	assert.deepEqual(drops, [
		{ kind: "moveProject", projectId: "project-1", targetIndex: 0 },
	]);
	controller.destroy();
});

test("autoscroll uses the nearest scrollable ancestor with exact speed and stopping", () => {
	const { document, window } = parseHTML(`
		<div id="scroller" style="overflow-y: auto">
			<main id="pad">
				<div data-sort-kind="bookmark" data-sort-id="one" data-zone="top">
					<button data-drag-handle data-sort-kind="bookmark" data-sort-id="one" data-zone="top"></button>
				</div>
			</main>
		</div>
		<aside id="projects"></aside>
	`);
	const scroller = document.getElementById("scroller");
	const source = document.querySelector("[data-sort-kind='bookmark']");
	source.getBoundingClientRect = () => rect(0, 100, 44, 40);
	scroller.getBoundingClientRect = () => rect(0, 0, 300, 200);
	Object.defineProperties(scroller, {
		clientHeight: { configurable: true, value: 200 },
		scrollHeight: { configurable: true, value: 600 },
	});
	const scrolls = [];
	scroller.scrollBy = (_x, y) => scrolls.push(y);
	window.getComputedStyle = () => ({
		overflowY: "auto",
	});
	const frames = [];
	window.requestAnimationFrame = (callback) => {
		frames.push(callback);
		return frames.length;
	};
	window.cancelAnimationFrame = () => {};
	let hitCalls = 0;
	document.elementsFromPoint = () => {
		hitCalls += 1;
		return [];
	};
	const controller = initializeLaunchDnd({
		document,
		window,
		pad: document.getElementById("pad"),
		projects: document.getElementById("projects"),
	});
	source
		.querySelector("button")
		.dispatchEvent(pointerEvent(window, "pointerdown", { pointerId: 26 }));
	document.dispatchEvent(
		pointerEvent(window, "pointermove", {
			clientX: 10,
			clientY: 100,
			pointerId: 26,
		}),
	);
	document.dispatchEvent(
		pointerEvent(window, "pointermove", {
			clientX: 10,
			clientY: 199,
			pointerId: 26,
		}),
	);
	frames.shift()?.();
	frames.shift()?.();
	assert.equal(scrolls[0], 18);
	assert.ok(hitCalls >= 2);

	document.dispatchEvent(
		pointerEvent(window, "pointermove", {
			clientX: 10,
			clientY: 100,
			pointerId: 26,
		}),
	);
	const before = scrolls.length;
	frames.shift()?.();
	assert.equal(scrolls.length, before);
	controller.cancel();
	controller.destroy();
});

test("supported drop matrix creates exact operations from stable identities", () => {
	for (const sourceZone of ["top", "pinned"]) {
		for (const targetZone of ["top", "pinned"]) {
			assert.deepEqual(
				operationFromDrop(
					{ sortKind: "bookmark", sortId: "bookmark-1", zone: sourceZone },
					{
						valid: true,
						listKind: "bookmarks",
						zone: targetZone,
						index: 2,
						exactSlot: true,
					},
				),
				{
					kind: "movePadLink",
					bookmarkId: "bookmark-1",
					targetZone,
					targetIndex: 2,
				},
			);
		}
	}

	assert.deepEqual(
		operationFromDrop(
			{ sortKind: "bookmark", sortId: "bookmark-1", zone: "top" },
			{
				valid: true,
				listKind: "bookmarks",
				zone: "project:p2",
				index: 3,
				exactSlot: true,
			},
		),
		{
			kind: "placeProjectLink",
			bookmarkId: "bookmark-1",
			targetProjectId: "p2",
			targetIndex: 3,
		},
	);
	assert.deepEqual(
		operationFromDrop(
			{ sortKind: "bookmark", sortId: "bookmark-1", zone: "project:p1" },
			{
				valid: true,
				listKind: "bookmarks",
				zone: "project:p2",
				index: 1,
				exactSlot: true,
			},
		),
		{
			kind: "placeProjectLink",
			bookmarkId: "bookmark-1",
			sourceProjectId: "p1",
			targetProjectId: "p2",
			targetIndex: 1,
		},
	);
	assert.deepEqual(
		operationFromDrop(
			{
				sortKind: "project",
				sortId: "p1",
				zone: "projects",
				position: 0,
			},
			{
				valid: true,
				listKind: "projects",
				zone: "project-list",
				index: 3,
				exactSlot: true,
			},
		),
		{ kind: "moveProject", projectId: "p1", targetIndex: 2 },
	);
});

test("project gaps convert pre-removal positions to exact post-removal indexes", () => {
	const project = {
		sortKind: "project",
		sortId: "p2",
		zone: "projects",
		position: 1,
	};
	function operationAt(index) {
		return operationFromDrop(project, {
			valid: true,
			listKind: "projects",
			zone: "project-list",
			index,
			exactSlot: true,
		});
	}

	assert.equal(operationAt(0).targetIndex, 0);
	assert.equal(operationAt(2).targetIndex, 1);
	assert.equal(operationAt(3).targetIndex, 2);
});

test("unsupported, cross-type, heading, contents, and outside drops reject", () => {
	const bookmark = {
		sortKind: "bookmark",
		sortId: "bookmark-1",
		zone: "project:p1",
	};
	const project = { sortKind: "project", sortId: "p1", zone: "projects" };
	const invalidTargets = [
		{ valid: false },
		{
			valid: true,
			listKind: "bookmarks",
			zone: "top",
			index: 0,
			exactSlot: true,
		},
		{
			valid: true,
			listKind: "projects",
			zone: "project-list",
			index: 0,
			exactSlot: true,
		},
		{
			valid: true,
			listKind: "project-heading",
			zone: "project:p2",
			index: 0,
			exactSlot: false,
		},
		{
			valid: true,
			listKind: "project-contents",
			zone: "project:p2",
			index: 0,
			exactSlot: false,
		},
	];
	for (const target of invalidTargets) {
		assert.equal(operationFromDrop(bookmark, target), null);
	}
	assert.equal(
		operationFromDrop(project, {
			valid: true,
			listKind: "bookmarks",
			zone: "project:p1",
			index: 0,
			exactSlot: true,
		}),
		null,
	);
	assert.equal(
		operationFromDrop(
			{ sortKind: "bookmark", sortId: "bookmark-1", zone: "top" },
			{
				valid: true,
				listKind: "projects",
				zone: "project-list",
				index: 0,
				exactSlot: true,
			},
		),
		null,
	);
});

test("eligible lists enforce additive project-only movement from projects", () => {
	assert.deepEqual(
		eligibleDropLists({ sortKind: "project", sortId: "p1", zone: "projects" }),
		["project-list"],
	);
	assert.deepEqual(
		eligibleDropLists({
			sortKind: "bookmark",
			sortId: "bookmark-1",
			zone: "project:p1",
		}),
		["project:*"],
	);
	assert.deepEqual(
		eligibleDropLists({
			sortKind: "bookmark",
			sortId: "bookmark-1",
			zone: "top",
		}),
		["top", "pinned", "project:*"],
	);
});

test("preview and final commit use the same validated immutable operation", () => {
	const { document, window } = parseHTML(`
		<main id="pad">
			<div class="top-grid" data-drop-list="bookmarks" data-drop-zone="top">
				<div data-sort-kind="bookmark" data-sort-id="bookmark-1" data-zone="top">
					<button data-drag-handle data-sort-kind="bookmark" data-sort-id="bookmark-1" data-zone="top"></button>
				</div>
			</div>
			<div data-drop-list="bookmarks" data-drop-zone="pinned"></div>
		</main>
		<aside id="projects"></aside>
	`);
	window.requestAnimationFrame = () => 1;
	window.cancelAnimationFrame = () => {};
	const source = document.querySelector("[data-sort-kind='bookmark']");
	const target = document.querySelector("[data-drop-zone='pinned']");
	source.getBoundingClientRect = () => rect(0, 0, 44, 40);
	document.elementsFromPoint = () => [target];
	const previews = [];
	const commits = [];
	const layout = {
		version: 1,
		bookmarks: [
			{
				_id: "bookmark-1",
				_creationTime: 1,
				title: "Exact",
				tags: ["top"],
				padPosition: 0,
				projects: [
					{ projectId: "p1", position: 0, name: " Name ", environment: "prod" },
				],
			},
		],
		projects: [{ _id: "p1", name: "One", position: 0 }],
	};
	const controller = initializeLaunchDnd({
		document,
		window,
		pad: document.getElementById("pad"),
		projects: document.getElementById("projects"),
		getLayout() {
			return layout;
		},
		onPreview(operation, result) {
			previews.push({ operation, result });
		},
		onDrop(operation, result) {
			commits.push({ operation, result });
		},
	});

	source
		.querySelector("button")
		.dispatchEvent(pointerEvent(window, "pointerdown", { pointerId: 31 }));
	document.dispatchEvent(
		pointerEvent(window, "pointermove", {
			clientX: 10,
			clientY: 10,
			pointerId: 31,
		}),
	);
	document.dispatchEvent(pointerEvent(window, "pointerup", { pointerId: 31 }));

	assert.equal(previews.length, 1);
	assert.equal(commits.length, 1);
	assert.equal(commits[0].operation, previews[0].operation);
	assert.equal(commits[0].result, previews[0].result);
	assert.deepEqual(
		commits[0].result.layout.bookmarks[0].projects[0],
		layout.bookmarks[0].projects[0],
	);
	assert.deepEqual(layout.bookmarks[0].tags, ["top"]);
	controller.destroy();
});

test("pointercancel over a valid preview cancels instead of committing", () => {
	const { document, window } = parseHTML(`
		<main id="pad">
			<div class="top-grid" data-drop-list="bookmarks" data-drop-zone="top">
				<div data-sort-kind="bookmark" data-sort-id="bookmark-1" data-zone="top">
					<button data-drag-handle data-sort-kind="bookmark" data-sort-id="bookmark-1" data-zone="top"></button>
				</div>
			</div>
			<div data-drop-list="bookmarks" data-drop-zone="pinned"></div>
		</main>
		<aside id="projects"></aside>
	`);
	window.requestAnimationFrame = () => 1;
	window.cancelAnimationFrame = () => {};
	const source = document.querySelector("[data-sort-kind='bookmark']");
	const target = document.querySelector("[data-drop-zone='pinned']");
	source.getBoundingClientRect = () => rect(0, 0, 44, 40);
	document.elementsFromPoint = () => [target];
	const previews = [];
	const commits = [];
	let cancels = 0;
	const controller = initializeLaunchDnd({
		document,
		window,
		pad: document.getElementById("pad"),
		projects: document.getElementById("projects"),
		getLayout() {
			return {
				version: 1,
				bookmarks: [
					{
						_id: "bookmark-1",
						_creationTime: 1,
						title: "Exact",
						tags: ["top"],
						padPosition: 0,
						projects: [],
					},
				],
				projects: [],
			};
		},
		onPreview(operation) {
			previews.push(operation);
		},
		onDrop(operation) {
			commits.push(operation);
		},
		onCancel() {
			cancels += 1;
		},
	});

	source
		.querySelector("button")
		.dispatchEvent(pointerEvent(window, "pointerdown", { pointerId: 32 }));
	document.dispatchEvent(
		pointerEvent(window, "pointermove", {
			clientX: 10,
			clientY: 10,
			pointerId: 32,
		}),
	);
	assert.equal(previews.length, 1);
	document.dispatchEvent(
		pointerEvent(window, "pointercancel", { pointerId: 32 }),
	);

	assert.deepEqual(commits, []);
	assert.equal(cancels, 1);
	assert.equal(controller.getState().phase, "idle");
	assert.equal(source.parentElement.dataset.dropZone, "top");
	assert.equal(document.querySelector(".launch-drag-placeholder"), null);
	controller.destroy();
});

test("active sessions report isActive and signal onIdle once after drop, cancel, or press", () => {
	const { document, window } = parseHTML(`
		<main id="pad">
			<div class="top-grid" data-drop-list="bookmarks" data-drop-zone="top">
				<div data-sort-kind="bookmark" data-sort-id="bookmark-1" data-zone="top">
					<button data-drag-handle data-sort-kind="bookmark" data-sort-id="bookmark-1" data-zone="top"></button>
				</div>
			</div>
			<div data-drop-list="bookmarks" data-drop-zone="pinned"></div>
		</main>
		<aside id="projects"></aside>
	`);
	window.requestAnimationFrame = () => 1;
	window.cancelAnimationFrame = () => {};
	const source = document.querySelector("[data-sort-kind='bookmark']");
	const handle = source.querySelector("button");
	handle.focus = () => {};
	source.getBoundingClientRect = () => rect(0, 0, 44, 40);
	document.elementsFromPoint = () => [
		document.querySelector("[data-drop-zone='pinned']"),
	];
	const events = [];
	const layout = {
		version: 1,
		bookmarks: [
			{
				_id: "bookmark-1",
				title: "A",
				tags: ["top"],
				padPosition: 0,
				projects: [],
			},
		],
		projects: [],
	};
	const controller = initializeLaunchDnd({
		document,
		window,
		pad: document.getElementById("pad"),
		projects: document.getElementById("projects"),
		getLayout: () => layout,
		onDrop() {
			events.push(["drop", controller.isActive()]);
		},
		onCancel() {
			events.push(["cancel", controller.isActive()]);
		},
		onIdle() {
			events.push(["idle", controller.isActive()]);
		},
	});

	assert.equal(controller.isActive(), false);
	handle.dispatchEvent(pointerEvent(window, "pointerdown", { pointerId: 1 }));
	assert.equal(controller.isActive(), true);
	document.dispatchEvent(
		pointerEvent(window, "pointermove", {
			clientX: 10,
			clientY: 10,
			pointerId: 1,
		}),
	);
	assert.equal(controller.isActive(), true);
	document.dispatchEvent(pointerEvent(window, "pointerup", { pointerId: 1 }));
	assert.deepEqual(events, [
		["drop", false],
		["idle", false],
	]);

	events.length = 0;
	handle.dispatchEvent(pointerEvent(window, "pointerdown", { pointerId: 2 }));
	document.dispatchEvent(
		pointerEvent(window, "pointermove", {
			clientX: 10,
			clientY: 10,
			pointerId: 2,
		}),
	);
	document.dispatchEvent(keyEvent(window, "Escape"));
	assert.deepEqual(events, [
		["cancel", false],
		["idle", false],
	]);

	events.length = 0;
	handle.dispatchEvent(pointerEvent(window, "pointerdown", { pointerId: 3 }));
	document.dispatchEvent(pointerEvent(window, "pointerup", { pointerId: 3 }));
	assert.deepEqual(events, [["idle", false]]);

	events.length = 0;
	controller.beforeRender();
	controller.afterRender();
	assert.deepEqual(
		events,
		[["cancel", false]],
		"idle renders do not signal onIdle",
	);
	controller.destroy();
});

test("keyboard bookmark drag owns movement keys, cycles zones, and announces exact copy", () => {
	const { document, window } = keyboardFixture();
	const layout = keyboardLayout();
	const drops = [];
	const controller = initializeLaunchDnd({
		document,
		window,
		pad: document.getElementById("pad"),
		projects: document.getElementById("projects"),
		getLayout() {
			return layout;
		},
		onDrop(operation) {
			drops.push(operation);
		},
	});
	const handle = document.querySelector(
		"[data-sort-id='b2'][data-zone='top'][data-drag-handle]",
	);
	handle.focus();

	const pickup = keyEvent(window, " ");
	handle.dispatchEvent(pickup);
	assert.equal(pickup.defaultPrevented, true);
	assert.equal(pickup.cancelBubble, true);
	assert.equal(handle.getAttribute("aria-pressed"), "true");
	assert.equal(
		document.getElementById("launch-dnd-live").textContent,
		"Moving GitHub. Top, position 2 of 5. Use arrow keys to move, Tab to change section, Enter to drop, or Escape to cancel.",
	);

	const right = keyEvent(window, "ArrowRight");
	handle.dispatchEvent(right);
	assert.equal(right.defaultPrevented, true);
	assert.equal(right.cancelBubble, true);
	assert.equal(
		document.getElementById("launch-dnd-live").textContent,
		"Top, position 3 of 5.",
	);

	handle.dispatchEvent(keyEvent(window, "ArrowLeft"));
	assert.equal(
		document.getElementById("launch-dnd-live").textContent,
		"Top, position 2 of 5.",
	);
	handle.dispatchEvent(keyEvent(window, "ArrowDown"));
	assert.equal(
		document.getElementById("launch-dnd-live").textContent,
		"Top, position 5 of 5.",
	);
	handle.dispatchEvent(keyEvent(window, "ArrowUp"));
	assert.equal(
		document.getElementById("launch-dnd-live").textContent,
		"Top, position 1 of 5.",
	);
	handle.dispatchEvent(keyEvent(window, "Home"));
	assert.equal(
		document.getElementById("launch-dnd-live").textContent,
		"Top, position 1 of 5.",
	);
	handle.dispatchEvent(keyEvent(window, "Tab"));
	assert.equal(
		document.getElementById("launch-dnd-live").textContent,
		"Pinned, position 1 of 3.",
	);
	handle.dispatchEvent(keyEvent(window, "Tab", { shiftKey: true }));
	handle.dispatchEvent(keyEvent(window, "End"));
	handle.dispatchEvent(keyEvent(window, "Enter"));

	assert.deepEqual(drops, [
		{
			kind: "movePadLink",
			bookmarkId: "b2",
			targetZone: "top",
			targetIndex: 4,
		},
	]);
	assert.equal(handle.hasAttribute("aria-pressed"), false);
	assert.equal(document.activeElement, handle);
	assert.equal(
		document.getElementById("launch-dnd-live").textContent,
		"Moved GitHub to Top, position 5.",
	);
	controller.destroy();
});

test("Left and Right stay owned but do not reorder outside Top", () => {
	const { document, window } = keyboardFixture();
	const previews = [];
	const controller = initializeLaunchDnd({
		document,
		window,
		pad: document.getElementById("pad"),
		projects: document.getElementById("projects"),
		getLayout: keyboardLayout,
		onPreview(operation) {
			previews.push(operation);
		},
	});
	const handle = document.querySelector(
		"[data-sort-id='b2'][data-zone='top'][data-drag-handle]",
	);
	handle.dispatchEvent(keyEvent(window, "Enter"));
	handle.dispatchEvent(keyEvent(window, "Tab"));
	const before = document.getElementById("launch-dnd-live").textContent;

	for (const key of ["ArrowLeft", "ArrowRight"]) {
		const event = keyEvent(window, key);
		handle.dispatchEvent(event);
		assert.equal(event.defaultPrevented, true, key);
		assert.equal(event.cancelBubble, true, key);
	}

	assert.equal(document.getElementById("launch-dnd-live").textContent, before);
	assert.equal(previews.length, 1, "only the Tab zone change previews");
	controller.destroy();
});

test("idle drag handles leave existing shortcuts and popover keys executable", () => {
	const { document, window } = keyboardFixture();
	const received = [];
	const controller = initializeLaunchDnd({
		document,
		window,
		pad: document.getElementById("pad"),
		projects: document.getElementById("projects"),
		getLayout: keyboardLayout,
		onKeyDown(event) {
			received.push(event.key);
		},
	});
	const handle = document.querySelector("[data-drag-handle]");
	let bubbled = 0;
	document.addEventListener("keydown", () => {
		bubbled += 1;
	});

	for (const key of ["a", "l", "g", "e", "c", "p", "Escape"]) {
		const event = keyEvent(window, key);
		handle.dispatchEvent(event);
		assert.equal(event.defaultPrevented, false, key);
		assert.equal(event.cancelBubble, false, key);
	}
	assert.deepEqual(received, ["a", "l", "g", "e", "c", "p", "Escape"]);
	assert.equal(bubbled, 7);
	controller.destroy();
});

test("keyboard project drag remains in project list and unrelated keys propagate", () => {
	const { document, window } = keyboardFixture();
	const controller = initializeLaunchDnd({
		document,
		window,
		pad: document.getElementById("pad"),
		projects: document.getElementById("projects"),
		getLayout: keyboardLayout,
	});
	const handle = document.querySelector(
		"[data-sort-id='p1'][data-zone='projects'][data-drag-handle]",
	);
	let bubbled = 0;
	document.addEventListener("keydown", () => {
		bubbled += 1;
	});
	const unrelated = keyEvent(window, "a");
	handle.dispatchEvent(unrelated);
	assert.equal(unrelated.defaultPrevented, false);
	assert.equal(bubbled, 1);

	handle.dispatchEvent(keyEvent(window, "Enter"));
	const tab = keyEvent(window, "Tab");
	handle.dispatchEvent(tab);
	assert.equal(tab.defaultPrevented, true);
	assert.equal(tab.cancelBubble, true);
	assert.equal(
		document.getElementById("launch-dnd-live").textContent,
		"Projects, position 1 of 2.",
	);
	handle.dispatchEvent(keyEvent(window, "ArrowDown"));
	assert.equal(
		document.getElementById("launch-dnd-live").textContent,
		"Projects, position 2 of 2.",
	);
	controller.cancel();
	controller.destroy();
});

test("cross-zone rollback restores focus to the origin handle", () => {
	const { document, window } = keyboardFixture();
	const pad = document.getElementById("pad");
	const projects = document.getElementById("projects");
	const controller = initializeLaunchDnd({
		document,
		window,
		pad,
		projects,
		getLayout: keyboardLayout,
	});
	const originHandle = document.querySelector(
		"[data-sort-id='b2'][data-zone='top'][data-drag-handle]",
	);
	originHandle.focus();
	originHandle.dispatchEvent(keyEvent(window, "Enter"));
	originHandle.dispatchEvent(keyEvent(window, "Tab"));
	originHandle.dispatchEvent(keyEvent(window, "Enter"));
	const origin = document.querySelector("[data-sort-id='b2'][data-zone='top']");
	const optimistic = replacementSortable(document, "pinned");
	origin.remove();
	pad.querySelector("[data-drop-zone='pinned']").append(optimistic);
	optimistic.querySelector("button").focus();
	assert.equal(document.activeElement.dataset.zone, "pinned");

	controller.restoreFocusToOrigin();
	controller.beforeRender();
	const result = document.querySelector(
		"[data-sort-id='b2'][data-zone='pinned']",
	);
	const restored = replacementSortable(document, "top");
	result.remove();
	pad.querySelector("[data-drop-zone='top']").append(restored);
	controller.afterRender();

	assert.equal(document.activeElement, restored.querySelector("button"));
	controller.destroy();
});

test("selective rollback restores focus to the failed item, not the latest drop origin", () => {
	const { document, window } = keyboardFixture();
	const pad = document.getElementById("pad");
	const controller = initializeLaunchDnd({
		document,
		window,
		pad,
		projects: document.getElementById("projects"),
		getLayout: keyboardLayout,
	});
	const latest = document.querySelector(
		"[data-sort-id='b3'][data-zone='top'][data-drag-handle]",
	);
	latest.focus();
	latest.dispatchEvent(keyEvent(window, "Enter"));
	latest.dispatchEvent(keyEvent(window, "Tab"));
	latest.dispatchEvent(keyEvent(window, "Enter"));

	controller.restoreFocusToOrigin({
		sortKind: "bookmark",
		sortId: "b2",
		zone: "top",
	});
	controller.beforeRender();
	controller.afterRender();
	assert.equal(
		`${document.activeElement?.dataset.sortId}:${document.activeElement?.dataset.zone}`,
		"b2:top",
	);

	latest.focus();
	controller.restoreFocusToOrigin({
		sortKind: "bookmark",
		sortId: "b2",
		zone: "top",
	});
	controller.beforeRender();
	document.querySelector("[data-sort-id='b2'][data-zone='top']").remove();
	controller.afterRender();
	assert.equal(document.activeElement?.id, "pad-heading");
	assert.equal(
		document.getElementById("launch-dnd-live").textContent,
		"GitHub is no longer available.",
	);
	controller.destroy();
});

test("keyboard cancel restores focus and exact origin announcement", () => {
	const { document, window } = keyboardFixture();
	const controller = initializeLaunchDnd({
		document,
		window,
		pad: document.getElementById("pad"),
		projects: document.getElementById("projects"),
		getLayout: keyboardLayout,
	});
	const handle = document.querySelector(
		"[data-sort-id='b2'][data-zone='top'][data-drag-handle]",
	);
	handle.focus();
	handle.dispatchEvent(keyEvent(window, "Enter"));
	handle.dispatchEvent(keyEvent(window, "Tab"));
	handle.dispatchEvent(keyEvent(window, "Escape"));
	assert.equal(handle.hasAttribute("aria-pressed"), false);
	assert.equal(document.activeElement, handle);
	assert.equal(
		document.getElementById("launch-dnd-live").textContent,
		"Move canceled. GitHub returned to Top, position 2.",
	);
	controller.destroy();
});

test("render focus restoration falls back after remote deletion and announces it", () => {
	const { document, window } = keyboardFixture();
	const controller = initializeLaunchDnd({
		document,
		window,
		pad: document.getElementById("pad"),
		projects: document.getElementById("projects"),
		getLayout: keyboardLayout,
	});
	const handle = document.querySelector(
		"[data-sort-id='b2'][data-zone='top'][data-drag-handle]",
	);
	handle.focus();
	controller.beforeRender();
	handle.closest("[data-sort-kind]").remove();
	controller.afterRender();
	assert.equal(document.activeElement, document.getElementById("pad-heading"));
	assert.equal(
		document.getElementById("launch-dnd-live").textContent,
		"GitHub is no longer available.",
	);
	controller.destroy();
});

test("render focus restoration follows stable identity across zones", () => {
	const { document, window } = keyboardFixture();
	const pad = document.getElementById("pad");
	const controller = initializeLaunchDnd({
		document,
		window,
		pad,
		projects: document.getElementById("projects"),
		getLayout: keyboardLayout,
	});
	const handle = document.querySelector(
		"[data-sort-id='b2'][data-zone='top'][data-drag-handle]",
	);
	handle.focus();
	controller.beforeRender();
	handle.closest("[data-sort-kind]").remove();
	const moved = replacementSortable(document, "pinned");
	pad.querySelector("[data-drop-zone='pinned']").append(moved);
	controller.afterRender();

	assert.equal(document.activeElement, moved.querySelector("button"));
	assert.notEqual(
		document.getElementById("launch-dnd-live").textContent,
		"GitHub is no longer available.",
	);
	controller.destroy();
});

test("rollback focus restoration requires the exact origin zone", () => {
	const { document, window } = keyboardFixture();
	const pad = document.getElementById("pad");
	const controller = initializeLaunchDnd({
		document,
		window,
		pad,
		projects: document.getElementById("projects"),
		getLayout: keyboardLayout,
	});
	const handle = document.querySelector(
		"[data-sort-id='b2'][data-zone='top'][data-drag-handle]",
	);
	handle.focus();
	handle.dispatchEvent(keyEvent(window, "Enter"));
	handle.dispatchEvent(keyEvent(window, "Tab"));
	handle.dispatchEvent(keyEvent(window, "Enter"));
	handle.closest("[data-sort-kind]").remove();
	const moved = replacementSortable(document, "pinned");
	pad.querySelector("[data-drop-zone='pinned']").append(moved);

	controller.restoreFocusToOrigin();
	controller.beforeRender();
	controller.afterRender();

	assert.equal(document.activeElement, document.getElementById("pad-heading"));
	controller.destroy();
});

function keyboardFixture() {
	const topItems = Array.from(
		{ length: 5 },
		(_, index) => `
			<div data-sort-kind="bookmark" data-sort-id="b${index + 1}" data-zone="top" data-position="${index}">
				<button data-drag-handle data-sort-kind="bookmark" data-sort-id="b${index + 1}" data-zone="top" aria-label="Move ${index === 1 ? "GitHub" : `Item ${index + 1}`}"></button>
			</div>`,
	).join("");
	const { document, window } = parseHTML(`
		<h1 id="pad-heading" tabindex="-1">Pad</h1>
		<main id="pad">
			<div class="top-grid" data-drop-list="bookmarks" data-drop-zone="top">${topItems}</div>
			<div data-drop-list="bookmarks" data-drop-zone="pinned">
				<div data-sort-kind="bookmark" data-sort-id="pin1" data-zone="pinned" data-position="0"></div>
				<div data-sort-kind="bookmark" data-sort-id="pin2" data-zone="pinned" data-position="1"></div>
			</div>
		</main>
		<aside id="projects" data-drop-list="projects">
			<section data-sort-kind="project" data-sort-id="p1" data-zone="projects" data-position="0">
				<button data-drag-handle data-sort-kind="project" data-sort-id="p1" data-zone="projects" aria-label="Move First project"></button>
				<div data-drop-list="bookmarks" data-drop-zone="project:p1"></div>
			</section>
			<section data-sort-kind="project" data-sort-id="p2" data-zone="projects" data-position="1">
				<button data-drag-handle data-sort-kind="project" data-sort-id="p2" data-zone="projects" aria-label="Move Second project"></button>
				<div data-drop-list="bookmarks" data-drop-zone="project:p2"></div>
			</section>
		</aside>
		<p id="launch-dnd-live"></p>
	`);
	window.requestAnimationFrame = () => 1;
	window.cancelAnimationFrame = () => {};
	Object.defineProperty(document, "activeElement", {
		configurable: true,
		writable: true,
		value: null,
	});
	for (const element of document.querySelectorAll(
		"button, #pad-heading, #pad",
	)) {
		element.focus = function focus() {
			document.activeElement = element;
		};
	}
	return { document, window };
}

function keyboardLayout() {
	return {
		version: 1,
		bookmarks: Array.from({ length: 5 }, (_, index) => ({
			_id: `b${index + 1}`,
			title: index === 1 ? "GitHub" : `Item ${index + 1}`,
			tags: ["top"],
			padPosition: index,
			projects: [],
		})),
		projects: [
			{ _id: "p1", name: "First", position: 0 },
			{ _id: "p2", name: "Second", position: 1 },
		],
	};
}

function replacementSortable(document, zone) {
	const sortable = document.createElement("div");
	sortable.dataset.sortKind = "bookmark";
	sortable.dataset.sortId = "b2";
	sortable.dataset.zone = zone;
	const handle = document.createElement("button");
	handle.dataset.dragHandle = "";
	handle.dataset.sortKind = "bookmark";
	handle.dataset.sortId = "b2";
	handle.dataset.zone = zone;
	handle.setAttribute("aria-label", "Move GitHub");
	handle.focus = function focus() {
		document.activeElement = handle;
	};
	sortable.append(handle);
	return sortable;
}

test("FLIP measurement and animation skip drag handles", () => {
	const { document, window } = parseHTML(`
		<main id="pad">
			<div class="top-grid" data-drop-list="bookmarks" data-drop-zone="top">
				<div data-sort-kind="bookmark" data-sort-id="one" data-zone="top">
					<button data-drag-handle data-sort-kind="bookmark" data-sort-id="one" data-zone="top"></button>
				</div>
				<div data-sort-kind="bookmark" data-sort-id="two" data-zone="top">
					<button data-drag-handle data-sort-kind="bookmark" data-sort-id="two" data-zone="top"></button>
				</div>
			</div>
		</main>
		<aside id="projects"></aside>
	`);
	window.requestAnimationFrame = () => 1;
	window.cancelAnimationFrame = () => {};
	const pad = document.getElementById("pad");
	const list = pad.firstElementChild;
	const source = list.children[0];
	const sibling = list.children[1];
	const siblingHandle = sibling.querySelector("button");
	const animated = [];
	const displaced = () => source.nextElementSibling !== sibling;
	source.getBoundingClientRect = () => rect(0, 0, 44, 40);
	sibling.getBoundingClientRect = () =>
		displaced() ? rect(50, 0, 44, 40) : rect(0, 0, 44, 40);
	siblingHandle.getBoundingClientRect = () =>
		displaced() ? rect(52, 2, 16, 16) : rect(2, 2, 16, 16);
	sibling.animate = () => animated.push("sibling");
	siblingHandle.animate = () => animated.push("sibling-handle");
	document.elementsFromPoint = () => [sibling, list];
	const controller = initializeLaunchDnd({
		document,
		window,
		pad,
		projects: document.getElementById("projects"),
	});

	source
		.querySelector("button")
		.dispatchEvent(pointerEvent(window, "pointerdown", { pointerId: 61 }));
	document.dispatchEvent(
		pointerEvent(window, "pointermove", {
			clientX: 60,
			clientY: 30,
			pointerId: 61,
		}),
	);

	assert.deepEqual(animated, ["sibling"]);
	controller.destroy();
});

test("post-drag click suppression expires with the gesture that armed it", () => {
	const { document, window } = parseHTML(`
		<main id="pad">
			<div class="top-grid" data-drop-list="bookmarks" data-drop-zone="top">
				<div data-sort-kind="bookmark" data-sort-id="one" data-zone="top">
					<button data-drag-handle data-sort-kind="bookmark" data-sort-id="one" data-zone="top"></button>
					<a href="/destination">One</a>
				</div>
			</div>
		</main>
		<aside id="projects"></aside>
	`);
	window.requestAnimationFrame = () => 1;
	window.cancelAnimationFrame = () => {};
	const handle = document.querySelector("button");
	const anchor = document.querySelector("a");
	handle.focus = () => {};
	handle.parentElement.getBoundingClientRect = () => rect(0, 0, 44, 40);
	const timers = [];
	const originalSetTimeout = window.setTimeout;
	window.setTimeout = (callback, delay) => {
		timers.push({ callback, delay });
		return timers.length;
	};
	const controller = initializeLaunchDnd({
		document,
		window,
		pad: document.getElementById("pad"),
		projects: document.getElementById("projects"),
	});

	function anchorClick() {
		const event = new window.Event("click", {
			bubbles: true,
			cancelable: true,
		});
		anchor.dispatchEvent(event);
		return event.defaultPrevented;
	}

	handle.dispatchEvent(pointerEvent(window, "pointerdown", { pointerId: 71 }));
	document.dispatchEvent(
		pointerEvent(window, "pointermove", { clientX: 8, pointerId: 71 }),
	);
	document.dispatchEvent(pointerEvent(window, "pointerup", { pointerId: 71 }));
	assert.equal(timers.at(-1).delay, 0);
	assert.equal(anchorClick(), true);
	timers.at(-1).callback();
	assert.equal(anchorClick(), false);

	handle.dispatchEvent(pointerEvent(window, "pointerdown", { pointerId: 72 }));
	document.dispatchEvent(
		pointerEvent(window, "pointermove", { clientX: 8, pointerId: 72 }),
	);
	document.dispatchEvent(
		pointerEvent(window, "pointercancel", { pointerId: 72 }),
	);
	assert.equal(anchorClick(), false);

	handle.dispatchEvent(pointerEvent(window, "pointerdown", { pointerId: 73 }));
	document.dispatchEvent(
		pointerEvent(window, "pointermove", { clientX: 8, pointerId: 73 }),
	);
	handle.dispatchEvent(keyEvent(window, "Escape"));
	assert.equal(anchorClick(), false);
	window.setTimeout = originalSetTimeout;
	controller.destroy();
});

test("authoritative rerenders restore the focused control type", () => {
	const { document, window } = parseHTML(`
		<main id="pad">
			<div class="top-grid" data-drop-list="bookmarks" data-drop-zone="top">
				<div data-sort-kind="bookmark" data-sort-id="one" data-zone="top">
					<button data-drag-handle data-sort-kind="bookmark" data-sort-id="one" data-zone="top" aria-label="Move One"></button>
					<a class="tile" href="/one">One</a>
				</div>
			</div>
		</main>
		<aside id="projects"></aside>
	`);
	const pad = document.getElementById("pad");
	const list = pad.firstElementChild;
	Object.defineProperty(document, "activeElement", {
		configurable: true,
		writable: true,
		value: list.querySelector("a"),
	});
	const controller = initializeLaunchDnd({
		document,
		window,
		pad,
		projects: document.getElementById("projects"),
	});

	function rerender() {
		const replacement = document.createElement("div");
		replacement.dataset.sortKind = "bookmark";
		replacement.dataset.sortId = "one";
		replacement.dataset.zone = "top";
		const replacementHandle = document.createElement("button");
		replacementHandle.dataset.dragHandle = "";
		replacementHandle.dataset.sortKind = "bookmark";
		replacementHandle.dataset.sortId = "one";
		replacementHandle.dataset.zone = "top";
		const replacementLink = document.createElement("a");
		replacementLink.className = "tile";
		replacementLink.href = "/one";
		for (const element of [replacementHandle, replacementLink]) {
			element.focus = () => {
				document.activeElement = element;
			};
		}
		replacement.append(replacementHandle, replacementLink);
		list.replaceChildren(replacement);
		return { replacementHandle, replacementLink };
	}

	controller.beforeRender();
	const restoredLink = rerender();
	controller.afterRender();
	assert.equal(
		document.activeElement === restoredLink.replacementLink,
		true,
		"a focused link must stay a link across an authoritative rerender",
	);

	document.activeElement.parentElement.querySelector("button").focus();
	controller.beforeRender();
	const restoredHandle = rerender();
	controller.afterRender();
	assert.equal(
		document.activeElement === restoredHandle.replacementHandle,
		true,
		"a focused handle must stay a handle across an authoritative rerender",
	);
	controller.destroy();
});

test("a pointer drop restores the moved item's handle without prior focus", () => {
	const { document, window } = parseHTML(`
		<main id="pad">
			<div class="top-grid" data-drop-list="bookmarks" data-drop-zone="top">
				<div data-sort-kind="bookmark" data-sort-id="one" data-zone="top">
					<button data-drag-handle data-sort-kind="bookmark" data-sort-id="one" data-zone="top"></button>
					<a class="tile" href="/one">One</a>
				</div>
			</div>
			<div class="row-list" data-drop-list="bookmarks" data-drop-zone="pinned"></div>
		</main>
		<aside id="projects"></aside>
	`);
	window.requestAnimationFrame = () => 1;
	window.cancelAnimationFrame = () => {};
	const pad = document.getElementById("pad");
	const pinned = pad.querySelector("[data-drop-zone='pinned']");
	const source = pad.querySelector("[data-sort-kind='bookmark']");
	source.getBoundingClientRect = () => rect(0, 0, 44, 40);
	document.elementsFromPoint = () => [pinned];
	Object.defineProperty(document, "activeElement", {
		configurable: true,
		writable: true,
		value: null,
	});
	let movedHandle = null;
	const controller = initializeLaunchDnd({
		document,
		window,
		pad,
		projects: document.getElementById("projects"),
		getLayout: () => ({
			version: 1,
			bookmarks: [
				{
					_id: "one",
					_creationTime: 1,
					title: "One",
					tags: ["top"],
					padPosition: 0,
					projects: [],
				},
			],
			projects: [],
		}),
		onDrop() {
			controller.beforeRender();
			const moved = document.createElement("div");
			moved.dataset.sortKind = "bookmark";
			moved.dataset.sortId = "one";
			moved.dataset.zone = "pinned";
			movedHandle = document.createElement("button");
			movedHandle.dataset.dragHandle = "";
			movedHandle.dataset.sortKind = "bookmark";
			movedHandle.dataset.sortId = "one";
			movedHandle.dataset.zone = "pinned";
			movedHandle.focus = () => {
				document.activeElement = movedHandle;
			};
			moved.append(movedHandle, document.createElement("a"));
			source.remove();
			pinned.replaceChildren(moved);
			controller.afterRender();
		},
	});

	source
		.querySelector("button")
		.dispatchEvent(pointerEvent(window, "pointerdown", { pointerId: 81 }));
	document.dispatchEvent(
		pointerEvent(window, "pointermove", {
			clientX: 10,
			clientY: 10,
			pointerId: 81,
		}),
	);
	document.dispatchEvent(pointerEvent(window, "pointerup", { pointerId: 81 }));

	assert.equal(
		document.activeElement === movedHandle,
		true,
		"a pointer drop must focus the handle at the item's new position",
	);
	controller.destroy();
});

function rect(left, top, width, height) {
	return {
		left,
		top,
		right: left + width,
		bottom: top + height,
		width,
		height,
	};
}

function pointerEvent(window, type, values = {}) {
	const event = new window.Event(type, { bubbles: true, cancelable: true });
	for (const [key, value] of Object.entries({
		button: 0,
		clientX: 0,
		clientY: 0,
		isPrimary: true,
		pointerId: 1,
		pointerType: "mouse",
		...values,
	})) {
		Object.defineProperty(event, key, { configurable: true, value });
	}
	return event;
}

function keyEvent(window, key, values = {}) {
	const event = new window.Event("keydown", {
		bubbles: true,
		cancelable: true,
	});
	for (const [name, value] of Object.entries({
		key,
		shiftKey: false,
		...values,
	})) {
		Object.defineProperty(event, name, { configurable: true, value });
	}
	return event;
}
