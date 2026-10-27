// @vitest-environment node

import type { FunctionReturnType } from "convex/server";
import { describe, expect, test } from "vitest";
import type { api } from "../../../../convex/_generated/api";
import { applyListingUpdate, withCopies } from "./optimistic";
import type { ListingView } from "./types";

type Page = FunctionReturnType<typeof api.yugioh.listings.listListings>;

function listing(id: string): ListingView {
	return { _id: id, conditionOverride: null } as unknown as ListingView;
}

function page(...ids: string[]): Page {
	return {
		listings: ids.map(listing),
		matching: 10,
		newCount: 0,
		rejectedCount: 0,
		total: 10,
		locations: [],
		cards: [],
	};
}

describe("applyListingUpdate", () => {
	test("patches the Listing in place", () => {
		const next = applyListingUpdate(page("a", "b"), listing("b")._id, (l) => ({
			...l,
			conditionOverride: "nearMint",
		}));
		expect(next.listings.map((l) => [l._id, l.conditionOverride])).toEqual([
			["a", null],
			["b", "nearMint"],
		]);
		expect(next.matching).toBe(10);
	});

	test("takes the Listing out of the view on null", () => {
		const next = applyListingUpdate(
			page("a", "b"),
			listing("a")._id,
			() => null,
		);
		expect(next.listings.map((l) => l._id)).toEqual(["b"]);
		expect(next.matching).toBe(9);
	});

	test("leaves a page that doesn't show the Listing as it was", () => {
		const before = page("a");
		expect(applyListingUpdate(before, listing("z")._id, () => null)).toBe(
			before,
		);
	});
});

describe("withCopies", () => {
	function priced(): ListingView {
		return {
			copiesOverride: null,
			titleRead: null,
			perCopyPrice: {
				price: 25,
				shipping: 5,
				importFees: 0,
				importFeePercent: 0,
				importFeeDefaulted: false,
				copies: 1,
				perCopy: 30,
			},
			deal: {
				qualifying: true,
				belowCondition: false,
				reference: { price: 20, sales: 4 },
				grade: "poor",
				percentOfReference: 150,
			},
		} as unknown as ListingView;
	}

	test("splits the landed total over the new Copies and regrades it", () => {
		const next = withCopies(priced(), 3);
		expect(next.copiesOverride).toBe(3);
		expect(next.perCopyPrice).toMatchObject({ copies: 3, perCopy: 10 });
		expect(next.deal).toMatchObject({ percentOfReference: 50, grade: "great" });
	});

	test("back to the title's Copies", () => {
		const listing = { ...withCopies(priced(), 3), titleRead: { copies: 2 } };
		const next = withCopies(listing as ListingView, null);
		expect(next.perCopyPrice).toMatchObject({ copies: 2, perCopy: 15 });
	});

	test("leaves an ungraded Listing ungraded", () => {
		const listing = priced();
		const ungraded = {
			...listing,
			deal: { ...listing.deal, grade: null, percentOfReference: null },
		};
		expect(withCopies(ungraded, 2).deal.grade).toBeNull();
	});
});
