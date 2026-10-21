// Rejected Listings: ones I marked wrong, with why. A Rejected Listing never
// counts toward prices, deals, cost to finish or pushes, and keeps its
// rejection across recaptures. Relative imports only (Convex imports this).

/** Why I marked a Listing wrong, in the order the menu offers them. */
export const REJECTION_REASONS = [
	"wrongLanguage",
	"wrongCard",
	"wrongRarity",
	"wrongPrinting",
	"graded",
	"lot",
	"fake",
	"other",
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

/** A Listing's rejection: why, and when (Unix ms). */
export type Rejection = { reason: RejectionReason; at: number };

/** Each reason as the menu and the "Marked wrong" view say it. */
export const REJECTION_REASON_LABELS: Record<RejectionReason, string> = {
	wrongLanguage: "Wrong language",
	wrongCard: "Wrong card",
	wrongRarity: "Wrong rarity",
	wrongPrinting: "Wrong set or Printing",
	graded: "Graded",
	lot: "Lot or multiple Copies",
	fake: "Fake or proxy",
	other: "Other",
};

/** Whether I marked a Listing wrong. A Listing from before rejections has none. */
export function isRejected(listing: {
	rejection?: Rejection | null;
}): boolean {
	return listing.rejection != null;
}
