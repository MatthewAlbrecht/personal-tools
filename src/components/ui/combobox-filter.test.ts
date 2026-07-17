import assert from "node:assert/strict";
import test from "node:test";
import { resolveComboboxFilteredItems } from "./combobox-filter";

const labels: Record<string, string> = {
	rock: "Rock",
	"indie rock": "Indie Rock",
	"art rock": "Art Rock",
	jazz: "Jazz",
	"free jazz": "Free Jazz",
};

function getItemLabel(item: string): string {
	return labels[item] ?? item;
}

test("empty filter returns browseItems when provided", () => {
	const result = resolveComboboxFilteredItems({
		items: ["rock", "indie rock", "jazz", "free jazz"],
		browseItems: ["rock", "jazz"],
		filter: "  ",
		getItemLabel,
	});
	assert.deepEqual(result.filteredItems, ["rock", "jazz"]);
	assert.equal(result.pinnedKeys.size, 0);
});

test("empty filter without browseItems returns items", () => {
	const items = ["rock", "indie rock"];
	const result = resolveComboboxFilteredItems({
		items,
		filter: "",
		getItemLabel,
	});
	assert.deepEqual(result.filteredItems, items);
	assert.equal(result.pinnedKeys.size, 0);
});

test("search pins matching browseItems first and keeps stable order within groups", () => {
	const result = resolveComboboxFilteredItems({
		items: ["indie rock", "art rock", "rock", "free jazz", "jazz"],
		browseItems: ["rock", "jazz"],
		filter: "rock",
		getItemLabel,
	});
	assert.deepEqual(result.filteredItems, ["rock", "indie rock", "art rock"]);
	assert.deepEqual([...result.pinnedKeys].sort(), ["rock"]);
});

test("search without browseItems filters only and does not pin", () => {
	const result = resolveComboboxFilteredItems({
		items: ["indie rock", "art rock", "rock"],
		filter: "rock",
		getItemLabel,
	});
	assert.deepEqual(result.filteredItems, ["indie rock", "art rock", "rock"]);
	assert.equal(result.pinnedKeys.size, 0);
});

test("match is case-insensitive on label or key", () => {
	const result = resolveComboboxFilteredItems({
		items: ["free jazz", "jazz"],
		browseItems: ["jazz"],
		filter: "JAZZ",
		getItemLabel,
	});
	assert.deepEqual(result.filteredItems, ["jazz", "free jazz"]);
	assert.ok(result.pinnedKeys.has("jazz"));
});
