import assert from "node:assert/strict";
import test from "node:test";
import {
	coverAnchorToFlex,
	coverTextLayoutToStyleProperties,
	resolveZineCoverTextLayout,
} from "./zine-cover-text-layout";

test("resolveZineCoverTextLayout applies defaults", () => {
	assert.deepEqual(resolveZineCoverTextLayout(undefined), {
		anchor: "center",
		textAlign: "center",
		offsetXIn: 0,
		offsetYIn: 0,
	});
});

test("resolveZineCoverTextLayout clamps offsets to slider range", () => {
	const resolved = resolveZineCoverTextLayout({
		offsetXIn: 2,
		offsetYIn: -1,
	});

	assert.equal(resolved.offsetXIn, 0.75);
	assert.equal(resolved.offsetYIn, -0.75);
});

test("coverAnchorToFlex maps nine anchors to flex alignment", () => {
	assert.deepEqual(coverAnchorToFlex("top-left"), {
		alignItems: "flex-start",
		justifyContent: "flex-start",
	});
	assert.deepEqual(coverAnchorToFlex("bottom-right"), {
		alignItems: "flex-end",
		justifyContent: "flex-end",
	});
	assert.deepEqual(coverAnchorToFlex("center"), {
		alignItems: "center",
		justifyContent: "center",
	});
});

test("coverTextLayoutToStyleProperties exposes CSS variables", () => {
	const styles = coverTextLayoutToStyleProperties({
		anchor: "bottom-center",
		textAlign: "left",
		offsetXIn: 0.1,
		offsetYIn: -0.2,
	});

	assert.equal(styles["--zine-cover-anchor-align"], "flex-end");
	assert.equal(styles["--zine-cover-anchor-justify"], "center");
	assert.equal(styles["--zine-cover-stack-align"], "flex-start");
	assert.equal(styles["--zine-cover-offset-x-in"], "0.1");
	assert.equal(styles["--zine-cover-offset-y-in"], "-0.2");
});
