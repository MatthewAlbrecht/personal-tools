import assert from "node:assert/strict";
import test from "node:test";
import {
	applyHideCreditLabel,
	applyShowCreditLabel,
	filterVisibleCredits,
	getHiddenCreditLabelsForRestore,
	isCreditLabelIgnored,
	sortCreditLabelsForAdminList,
} from "./geniusCreditVisibility";

const producerCredit = {
	label: "Producer",
	contributors: [{ name: "Flying Lotus" }],
};

const writerCredit = {
	label: "Writers",
	contributors: [{ name: "Niki Randa" }],
};

test("filterVisibleCredits hides site-wide default labels", () => {
	assert.deepEqual(
		filterVisibleCredits([producerCredit, writerCredit], {
			siteWideHiddenLabelKeys: ["producer"],
		}),
		[writerCredit],
	);
});

test("filterVisibleCredits hides local labels", () => {
	assert.deepEqual(
		filterVisibleCredits([producerCredit, writerCredit], {
			hiddenCreditLabels: ["Producer"],
		}),
		[writerCredit],
	);
});

test("filterVisibleCredits honors local show override for hidden defaults", () => {
	assert.deepEqual(
		filterVisibleCredits([producerCredit, writerCredit], {
			siteWideHiddenLabelKeys: ["producer"],
			shownCreditLabels: ["Producer"],
		}),
		[producerCredit, writerCredit],
	);
});

test("applyHideCreditLabel adds local hide and clears shown override", () => {
	assert.deepEqual(
		applyHideCreditLabel(
			{
				hiddenCreditLabels: [],
				shownCreditLabels: ["Producer"],
				siteWideHiddenLabelKeys: ["producer"],
			},
			"Producer",
		),
		{
			hiddenCreditLabels: ["Producer"],
			shownCreditLabels: undefined,
		},
	);
});

test("applyShowCreditLabel restores global hide with shown override", () => {
	assert.deepEqual(
		applyShowCreditLabel(
			{
				hiddenCreditLabels: ["Producer"],
				shownCreditLabels: [],
				siteWideHiddenLabelKeys: ["producer"],
			},
			"Producer",
		),
		{
			hiddenCreditLabels: undefined,
			shownCreditLabels: ["Producer"],
		},
	);
});

test("getHiddenCreditLabelsForRestore lists hidden labels in source order", () => {
	assert.deepEqual(
		getHiddenCreditLabelsForRestore([producerCredit, writerCredit], {
			siteWideHiddenLabelKeys: ["producer"],
			hiddenCreditLabels: ["Writers"],
		}),
		["Producer", "Writers"],
	);
});

test("sortCreditLabelsForAdminList puts hidden defaults first", () => {
	assert.deepEqual(
		sortCreditLabelsForAdminList([
			{
				key: "writers",
				label: "Writers",
				hiddenByDefault: false,
			},
			{
				key: "producer",
				label: "Producer",
				hiddenByDefault: true,
			},
		]).map((row) => row.label),
		["Producer", "Writers"],
	);
});

test("isCreditLabelIgnored matches labels containing configured keywords", () => {
	assert.equal(
		isCreditLabelIgnored("Spanish Translation", ["translation"]),
		true,
	);
	assert.equal(isCreditLabelIgnored("Producer", ["translation"]), false);
});

test("filterVisibleCredits always hides ignored labels", () => {
	assert.deepEqual(
		filterVisibleCredits(
			[
				producerCredit,
				{
					label: "Spanish Translation",
					contributors: [{ name: "Someone" }],
				},
			],
			{
				ignoredLabelKeys: ["translation"],
				shownCreditLabels: ["Spanish Translation"],
			},
		),
		[producerCredit],
	);
});

test("getHiddenCreditLabelsForRestore excludes ignored labels", () => {
	assert.deepEqual(
		getHiddenCreditLabelsForRestore(
			[
				producerCredit,
				{
					label: "Samples",
					contributors: [{ name: "Someone" }],
				},
			],
			{
				hiddenCreditLabels: ["Producer"],
				ignoredLabelKeys: ["samples"],
			},
		),
		["Producer"],
	);
});
