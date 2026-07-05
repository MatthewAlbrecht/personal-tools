import assert from "node:assert/strict";
import test from "node:test";
import {
	ZINE_INSIDE_BACK_LAYOUT_DEFAULTS,
	formatInsideBackAlbumTitle,
	insideBackLayoutFromStoredFields,
	insideBackLayoutToStyleProperties,
	resolveZineInsideBackLayoutSettings,
} from "./zine-inside-back-layout";

test("resolveZineInsideBackLayoutSettings uses defaults for missing fields", () => {
	assert.deepEqual(resolveZineInsideBackLayoutSettings(), {
		...ZINE_INSIDE_BACK_LAYOUT_DEFAULTS,
	});
});

test("resolveZineInsideBackLayoutSettings merges stored partial settings", () => {
	assert.deepEqual(
		resolveZineInsideBackLayoutSettings({
			marginTopPt: 12,
			contentAlign: "center",
			artistDisplay: "inline",
			recommendationRowAlign: "center",
		}),
		{
			marginTopPt: 12,
			marginRightPt: ZINE_INSIDE_BACK_LAYOUT_DEFAULTS.marginRightPt,
			marginBottomPt: ZINE_INSIDE_BACK_LAYOUT_DEFAULTS.marginBottomPt,
			marginLeftPt: ZINE_INSIDE_BACK_LAYOUT_DEFAULTS.marginLeftPt,
			contentAlign: "center",
			artistDisplay: "inline",
			recommendationRowAlign: "center",
		},
	);
});

test("insideBackLayoutFromStoredFields maps persisted field names", () => {
	assert.deepEqual(
		insideBackLayoutFromStoredFields({
			zineInsideBackMarginTopPt: 10,
			zineInsideBackMarginRightPt: 11,
			zineInsideBackMarginBottomPt: 12,
			zineInsideBackMarginLeftPt: 13,
			zineInsideBackContentAlign: "center",
			zineInsideBackArtistDisplay: "inline",
			zineInsideBackRecommendationRowAlign: "center",
		}),
		{
			marginTopPt: 10,
			marginRightPt: 11,
			marginBottomPt: 12,
			marginLeftPt: 13,
			contentAlign: "center",
			artistDisplay: "inline",
			recommendationRowAlign: "center",
		},
	);
});

test("insideBackLayoutToStyleProperties emits CSS custom properties", () => {
	assert.deepEqual(
		insideBackLayoutToStyleProperties({
			marginTopPt: 8,
			marginRightPt: 9,
			marginBottomPt: 10,
			marginLeftPt: 11,
			contentAlign: "right",
			artistDisplay: "newline",
			recommendationRowAlign: "top",
		}),
		{
			"--zine-inside-back-margin-top-pt": "8",
			"--zine-inside-back-margin-right-pt": "9",
			"--zine-inside-back-margin-bottom-pt": "10",
			"--zine-inside-back-margin-left-pt": "11",
		},
	);
});

test("formatInsideBackAlbumTitle returns title and artist lines", () => {
	assert.deepEqual(
		formatInsideBackAlbumTitle({
			albumTitle: "OK Computer",
			year: "1997",
			artistName: "Radiohead",
		}),
		{
			titleLine: "OK Computer (1997)",
			artistLine: "Radiohead",
		},
	);
});

test("formatInsideBackAlbumTitle omits artist line when name missing", () => {
	assert.deepEqual(
		formatInsideBackAlbumTitle({
			albumTitle: "Kid A",
			year: "2000",
		}),
		{
			titleLine: "Kid A (2000)",
		},
	);
});
