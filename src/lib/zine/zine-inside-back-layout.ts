export type ZineInsideBackContentAreaAlign = "top" | "center";

export type ZineInsideBackArtistDisplay = "newline" | "inline";

export type ZineInsideBackRecommendationRowAlign = "top" | "center";

export type ZineInsideBackLayoutSettings = {
	marginTopPt: number;
	marginRightPt: number;
	marginBottomPt: number;
	marginLeftPt: number;
	contentAreaAlign: ZineInsideBackContentAreaAlign;
	artistDisplay: ZineInsideBackArtistDisplay;
	recommendationRowAlign: ZineInsideBackRecommendationRowAlign;
};

export const ZINE_INSIDE_BACK_LAYOUT_DEFAULTS: ZineInsideBackLayoutSettings = {
	marginTopPt: 25,
	marginRightPt: 25,
	marginBottomPt: 25,
	marginLeftPt: 25,
	contentAreaAlign: "top",
	artistDisplay: "newline",
	recommendationRowAlign: "top",
};

export const ZINE_INSIDE_BACK_MARGIN_SLIDER = {
	minPt: 0,
	maxPt: 48,
	stepPt: 1,
} as const;

type StoredContentAreaAlign =
	| ZineInsideBackContentAreaAlign
	| "right"
	| undefined;

export function normalizeZineInsideBackContentAreaAlign(
	stored: StoredContentAreaAlign,
): ZineInsideBackContentAreaAlign {
	if (stored === "center") {
		return "center";
	}

	if (stored === "right") {
		return "top";
	}

	return stored ?? ZINE_INSIDE_BACK_LAYOUT_DEFAULTS.contentAreaAlign;
}

export function resolveZineInsideBackLayoutSettings(
	stored?: Partial<ZineInsideBackLayoutSettings> | null,
): ZineInsideBackLayoutSettings {
	const resolved = {
		marginTopPt:
			stored?.marginTopPt ?? ZINE_INSIDE_BACK_LAYOUT_DEFAULTS.marginTopPt,
		marginRightPt:
			stored?.marginRightPt ?? ZINE_INSIDE_BACK_LAYOUT_DEFAULTS.marginRightPt,
		marginBottomPt:
			stored?.marginBottomPt ?? ZINE_INSIDE_BACK_LAYOUT_DEFAULTS.marginBottomPt,
		marginLeftPt:
			stored?.marginLeftPt ?? ZINE_INSIDE_BACK_LAYOUT_DEFAULTS.marginLeftPt,
		contentAreaAlign:
			stored?.contentAreaAlign ??
			ZINE_INSIDE_BACK_LAYOUT_DEFAULTS.contentAreaAlign,
		artistDisplay:
			stored?.artistDisplay ?? ZINE_INSIDE_BACK_LAYOUT_DEFAULTS.artistDisplay,
		recommendationRowAlign:
			stored?.recommendationRowAlign ??
			ZINE_INSIDE_BACK_LAYOUT_DEFAULTS.recommendationRowAlign,
	};

	return {
		...resolved,
		contentAreaAlign: normalizeZineInsideBackContentAreaAlign(
			resolved.contentAreaAlign,
		),
	};
}

export function insideBackLayoutFromStoredFields(fields: {
	zineInsideBackMarginTopPt?: number;
	zineInsideBackMarginRightPt?: number;
	zineInsideBackMarginBottomPt?: number;
	zineInsideBackMarginLeftPt?: number;
	zineInsideBackContentAlign?: StoredContentAreaAlign;
	zineInsideBackArtistDisplay?: ZineInsideBackArtistDisplay;
	zineInsideBackRecommendationRowAlign?: ZineInsideBackRecommendationRowAlign;
}): Partial<ZineInsideBackLayoutSettings> {
	return {
		marginTopPt: fields.zineInsideBackMarginTopPt,
		marginRightPt: fields.zineInsideBackMarginRightPt,
		marginBottomPt: fields.zineInsideBackMarginBottomPt,
		marginLeftPt: fields.zineInsideBackMarginLeftPt,
		contentAreaAlign: normalizeZineInsideBackContentAreaAlign(
			fields.zineInsideBackContentAlign,
		),
		artistDisplay: fields.zineInsideBackArtistDisplay,
		recommendationRowAlign: fields.zineInsideBackRecommendationRowAlign,
	};
}

export function formatInsideBackAlbumTitle({
	albumTitle,
	year,
	artistName,
}: {
	albumTitle: string;
	year?: string;
	artistName?: string;
}): { titleLine: string; artistLine?: string } {
	const titleWithYear = [albumTitle, year ? `(${year})` : ""]
		.filter(Boolean)
		.join(" ");
	const trimmedArtist = artistName?.trim();

	return {
		titleLine: titleWithYear,
		...(trimmedArtist ? { artistLine: trimmedArtist } : {}),
	};
}

export function insideBackLayoutToStyleProperties(
	settings: ZineInsideBackLayoutSettings,
): Record<string, string> {
	return {
		"--zine-inside-back-margin-top-pt": String(settings.marginTopPt),
		"--zine-inside-back-margin-right-pt": String(settings.marginRightPt),
		"--zine-inside-back-margin-bottom-pt": String(settings.marginBottomPt),
		"--zine-inside-back-margin-left-pt": String(settings.marginLeftPt),
	};
}
