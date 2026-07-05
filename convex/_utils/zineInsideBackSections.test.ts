import assert from "node:assert/strict";
import test from "node:test";
import { normalizeZineInsideBackSections } from "./zineInsideBackSections";

test("normalizeZineInsideBackSections trims strings and drops empty items", () => {
	const result = normalizeZineInsideBackSections([
		{
			type: "discography",
			title: "  My discography  ",
			items: [
				{
					albumTitle: " Kid A ",
					artistName: " Radiohead ",
					year: " 2000 ",
					imageUrl: " https://example.com/kid-a.jpg ",
					blurb: " Experimental pivot. ",
				},
				{ albumTitle: "  ", blurb: "skip me" },
			],
		},
	]);

	assert.equal(result.length, 1);
	assert.equal(result[0]?.type, "discography");
	if (result[0]?.type !== "discography")
		throw new Error("expected discography");
	assert.equal(result[0].title, "My discography");
	assert.equal(result[0].items.length, 1);
	assert.deepEqual(result[0].items[0], {
		albumTitle: "Kid A",
		artistName: "Radiohead",
		year: "2000",
		imageUrl: "https://example.com/kid-a.jpg",
		blurb: "Experimental pivot.",
		spotifyAlbumId: undefined,
		hidden: undefined,
	});
});

test("normalizeZineInsideBackSections trims recommendation year", () => {
	const result = normalizeZineInsideBackSections([
		{
			type: "recommendations",
			items: [
				{
					albumTitle: "OK Computer",
					artistName: "Radiohead",
					year: " 1997 ",
				},
			],
		},
	]);

	assert.equal(result.length, 1);
	if (result[0]?.type !== "recommendations") {
		throw new Error("expected recommendations");
	}
	assert.equal(result[0].items[0]?.year, "1997");
});

test("normalizeZineInsideBackSections drops sections with no valid items", () => {
	const result = normalizeZineInsideBackSections([
		{
			type: "recommendations",
			items: [{ albumTitle: "", artistName: "X" }],
		},
	]);
	assert.deepEqual(result, []);
});

test("normalizeZineInsideBackSections keeps discography items without blurbs", () => {
	const result = normalizeZineInsideBackSections([
		{
			type: "discography",
			items: [{ albumTitle: "Kid A", blurb: "" }],
		},
	]);

	assert.equal(result.length, 1);
	if (result[0]?.type !== "discography")
		throw new Error("expected discography");
	assert.equal(result[0].items[0]?.blurb, "");
});

test("normalizeZineInsideBackSections enforces item caps", () => {
	const items = Array.from({ length: 55 }, (_, index) => ({
		albumTitle: `Album ${index + 1}`,
		blurb: "note",
	}));
	const result = normalizeZineInsideBackSections([
		{ type: "discography", items },
	]);
	if (result[0]?.type !== "discography")
		throw new Error("expected discography");
	assert.equal(result[0].items.length, 50);
});
