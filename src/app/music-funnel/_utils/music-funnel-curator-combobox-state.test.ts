import assert from "node:assert/strict";
import test from "node:test";
import {
	getCuratorComboboxItemLabel,
	resolveCuratorComboboxBlurValue,
	resolveCuratorComboboxItems,
	resolveCuratorComboboxValueChange,
} from "./music-funnel-curator-combobox-state";

test("create option uses the plain curator name as its item value", () => {
	const { items, createItem } = resolveCuratorComboboxItems({
		curators: ["Alice"],
		value: "",
		filter: "Bob",
	});

	assert.equal(createItem, "Bob");
	assert.deepEqual(items, ["Alice", "Bob"]);
	assert.ok(!items.some((item) => item.startsWith("__create__:")));
});

test("create option label shows Create wrapper only for the create item", () => {
	assert.equal(
		getCuratorComboboxItemLabel({ item: "Bob", createItem: "Bob" }),
		"Create “Bob”",
	);
	assert.equal(
		getCuratorComboboxItemLabel({ item: "Alice", createItem: "Bob" }),
		"Alice",
	);
});

test("after selecting create item, selected value stays in items so Base UI will not clear", () => {
	const selected = resolveCuratorComboboxValueChange("Bob");
	assert.equal(selected, "Bob");

	const after = resolveCuratorComboboxItems({
		curators: ["Alice"],
		value: selected,
		filter: selected,
	});

	assert.ok(after.items.includes(selected));
	assert.equal(after.createItem, null);
	assert.deepEqual(after.items, ["Bob", "Alice"]);
});

test("does not offer create when filter matches an existing curator case-insensitively", () => {
	const { items, createItem } = resolveCuratorComboboxItems({
		curators: ["Alice"],
		value: "",
		filter: "alice",
	});

	assert.equal(createItem, null);
	assert.deepEqual(items, ["Alice"]);
});

test("clears selection when value change is null", () => {
	assert.equal(resolveCuratorComboboxValueChange(null), "");
});

test("commits a typed curator when the input loses focus", () => {
	assert.equal(
		resolveCuratorComboboxBlurValue("  Bob Smith  ", ""),
		"Bob Smith",
	);
	assert.equal(resolveCuratorComboboxBlurValue("   ", "Alice"), "Alice");
});
