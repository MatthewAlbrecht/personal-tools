import { describe, expect, test } from "vitest";
import { MAX_VISITS_PER_RUN, buildVisitPlan } from "./automation";

const ash = {
	setCodes: ["MP23-EN001", "RA01-EN008"],
	newlyListedUrl: "https://www.ebay.com/sch/i.html?_nkw=ash&_sop=10",
	soldUrl:
		"https://www.ebay.com/sch/i.html?_nkw=ash&LH_Sold=1&LH_Complete=1&_sop=13",
};
const called = {
	setCodes: ["RA01-EN060"],
	newlyListedUrl: "https://www.ebay.com/sch/i.html?_nkw=called&_sop=10",
	soldUrl:
		"https://www.ebay.com/sch/i.html?_nkw=called&LH_Sold=1&LH_Complete=1&_sop=13",
};
const ashProduct = {
	cardName: "Ash Blossom & Joyous Spring",
	setCode: "MP23-EN001",
	productUrl: "https://www.tcgplayer.com/product/524817/ash",
};

describe("the visit plan", () => {
	test("each Search's Newly Listed then Sold page, then the TCGplayer pages", () => {
		expect(buildVisitPlan([ash, called], [ashProduct])).toEqual([
			{
				url: ash.newlyListedUrl,
				kind: "ebayNewlyListed",
				label: "MP23-EN001, RA01-EN008",
			},
			{ url: ash.soldUrl, kind: "ebaySold", label: "MP23-EN001, RA01-EN008" },
			{
				url: called.newlyListedUrl,
				kind: "ebayNewlyListed",
				label: "RA01-EN060",
			},
			{ url: called.soldUrl, kind: "ebaySold", label: "RA01-EN060" },
			{
				url: ashProduct.productUrl,
				kind: "tcgplayer",
				label: "Ash Blossom & Joyous Spring MP23-EN001",
			},
		]);
	});

	test("visits a page once, even when two Printings share a TCGplayer product", () => {
		const plan = buildVisitPlan(
			[ash],
			[ashProduct, { ...ashProduct, setCode: "MP23-EN001a" }],
		);
		expect(plan.map((visit) => visit.kind)).toEqual([
			"ebayNewlyListed",
			"ebaySold",
			"tcgplayer",
		]);
	});

	test("is capped", () => {
		const many = Array.from({ length: 400 }, (_, i) => ({
			cardName: `Card ${i}`,
			setCode: `SET-EN${i}`,
			productUrl: `https://www.tcgplayer.com/product/${i}/x`,
		}));
		expect(buildVisitPlan([], many)).toHaveLength(MAX_VISITS_PER_RUN);
	});
});
