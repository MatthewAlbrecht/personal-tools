import assert from "node:assert/strict";
import test from "node:test";
import { formatPrimaryGenresLine } from "./listen-history-row";

test("formatPrimaryGenresLine joins labels with commas", () => {
	assert.equal(
		formatPrimaryGenresLine([
			{ key: "indie-rock", label: "Indie Rock" },
			{ key: "dream-pop", label: "Dream Pop" },
		]),
		"Indie Rock, Dream Pop",
	);
});

test("formatPrimaryGenresLine returns null when empty so no spacer renders", () => {
	assert.equal(formatPrimaryGenresLine(undefined), null);
	assert.equal(formatPrimaryGenresLine([]), null);
	assert.equal(formatPrimaryGenresLine([{ key: "x", label: "  " }]), null);
});
