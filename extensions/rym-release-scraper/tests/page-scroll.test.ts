// @vitest-environment node
// Scrolling a results page before it's read (ticket 20): down in uneven
// steps with short pauses, to about the end of the results. The window, the
// pauses and the random draws are fakes.

import { describe, expect, test } from "vitest";
import "../page-scroll.js";

type View = {
	scrollY: number;
	innerHeight: number;
	scrollBy: (options: { top: number; behavior: string }) => void;
};

declare global {
	var scrollThroughPage: (deps: {
		view: View;
		endOf: () => number;
		random: () => number;
		wait: (ms: number) => Promise<void>;
	}) => Promise<number>;
}

/** A 1000px-tall window whose page ends at `end` (a function of the scroll). */
function fakePage(end: (scrollY: number) => number, draws: number[] = []) {
	const events: string[] = [];
	const view: View = {
		scrollY: 0,
		innerHeight: 1000,
		scrollBy({ top, behavior }) {
			expect(behavior).toBe("smooth");
			view.scrollY += top;
			events.push(`to ${view.scrollY}`);
		},
	};
	return {
		events,
		deps: {
			view,
			endOf: () => end(view.scrollY),
			random: () => draws.shift() ?? 0.5,
			async wait(ms: number) {
				events.push(`wait ${ms}`);
			},
		},
	};
}

describe("scrolling a results page before reading it", () => {
	test("scrolls down in steps of about a screen, with a short pause after each, to about the end", async () => {
		const { deps, events } = fakePage(() => 2000);

		const steps = await globalThis.scrollThroughPage(deps);

		// A draw of 0.5 is a 750px step and a 925ms pause.
		expect(events).toEqual([
			"to 750",
			"wait 925",
			"to 1500",
			"wait 925",
			"to 2000",
			"wait 925",
		]);
		expect(steps).toBe(3);
	});

	test("the steps and pauses vary with the draws", async () => {
		const { deps, events } = fakePage(() => 5000, [0, 0, 1, 1]);

		await globalThis.scrollThroughPage(deps);

		expect(events.slice(0, 4)).toEqual([
			"to 450",
			"wait 350",
			"to 1500",
			"wait 1500",
		]);
	});

	test("keeps going when late rows make the page longer", async () => {
		// The results end at 1000 until the page is scrolled, then at 2500.
		const { deps, events } = fakePage((scrollY) => (scrollY > 0 ? 2500 : 1000));

		await globalThis.scrollThroughPage(deps);

		expect(events.filter((e) => e.startsWith("to")).at(-1)).toBe("to 2500");
	});

	test("stops near the end rather than scrolling a last sliver", async () => {
		const { deps, events } = fakePage(() => 1600);

		await globalThis.scrollThroughPage(deps);

		// After 750 and 1500, 100px is left: close enough.
		expect(events.filter((e) => e.startsWith("to"))).toEqual([
			"to 750",
			"to 1500",
		]);
	});

	test("a page that fits on the screen isn't scrolled", async () => {
		const { deps, events } = fakePage(() => 0);

		expect(await globalThis.scrollThroughPage(deps)).toBe(0);
		expect(events).toEqual([]);
	});

	test("a page that never stops growing is scrolled a bounded number of times", async () => {
		const { deps } = fakePage((scrollY) => scrollY + 5000);

		expect(await globalThis.scrollThroughPage(deps)).toBe(30);
	});
});
