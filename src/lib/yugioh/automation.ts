// Automated browser runs: which pages a run visits, and the run rules shared
// by Convex (relative imports only) and the /yugioh UI.
// How the runs are driven: docs/yugioh/automation.md.

import type { Search } from "./searches";

export type RunTrigger = "launchAgent" | "t3" | "manual";

export type RunStatus = "requested" | "running" | "finished" | "failed";

export type VisitKind = "ebayNewlyListed" | "ebaySold" | "tcgplayer";

export type PlannedVisit = {
	url: string;
	kind: VisitKind;
	/** The set codes of a Search, or a Printing's Card name and set code. */
	label: string;
};

/**
 * A run still open this long is treated as abandoned (the Mac slept, the
 * script was killed): the next request closes it as failed. Longer than the
 * script's own 90-minute limit, so a live run is never cut short.
 */
export const RUN_ABANDONED_AFTER_MS = 2 * 60 * 60 * 1000;

/** At most this many pages a run: well past a full Deck's Searches and products. */
export const MAX_VISITS_PER_RUN = 300;

/**
 * The pages one run visits, in order: each Search's Newly Listed page then
 * its Sold page, then each TCGplayer product page. A URL is visited once.
 */
export function buildVisitPlan(
	searches: ReadonlyArray<
		Pick<Search, "setCodes" | "newlyListedUrl" | "soldUrl">
	>,
	products: ReadonlyArray<{
		cardName: string;
		setCode: string;
		productUrl: string;
	}>,
): PlannedVisit[] {
	const visits: PlannedVisit[] = [
		...searches.flatMap((search): PlannedVisit[] => {
			const label = search.setCodes.join(", ");
			return [
				{ url: search.newlyListedUrl, kind: "ebayNewlyListed", label },
				{ url: search.soldUrl, kind: "ebaySold", label },
			];
		}),
		...products.map(
			(product): PlannedVisit => ({
				url: product.productUrl,
				kind: "tcgplayer",
				label: `${product.cardName} ${product.setCode}`,
			}),
		),
	];
	const seen = new Set<string>();
	return visits
		.filter((visit) => {
			if (seen.has(visit.url)) return false;
			seen.add(visit.url);
			return true;
		})
		.slice(0, MAX_VISITS_PER_RUN);
}
