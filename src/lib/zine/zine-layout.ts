export const ZINE_PAGE = {
	widthIn: 5.5,
	heightIn: 8.5,
	marginIn: 0.35,
} as const;

/** Uniform inset (inches) on all sides inside each booklet half-panel (`border-box` keeps panel 5.5in × 8.5in). */
export const ZINE_BOOKLET_PANEL_PADDING_IN = 0.15;

export const ZINE_ALBUM_ART_IN = 1.7;

/** Bottom band for cliffnotes/credits lines; half of album-art height. */
export const ZINE_FOOTER_ZONE_IN = ZINE_ALBUM_ART_IN / 2;

const POINTS_PER_INCH = 72;

/** Fixed footer band height in pt (1 pt = 1/72in); matches `.zine-song-page-footer` / `ZINE_FOOTER_ZONE_IN`. */
export const ZINE_FOOTER_ZONE_HEIGHT_PT = ZINE_FOOTER_ZONE_IN * POINTS_PER_INCH;

/** CSS reference pixels per inch (1in === 96px). */
export const ZINE_CSS_PX_PER_IN = 96;

/** Footer reserve in CSS px; same physical height as `ZINE_FOOTER_ZONE_IN` (96 CSS px per inch). */
export const ZINE_FOOTER_ZONE_CSS_PX = ZINE_FOOTER_ZONE_IN * ZINE_CSS_PX_PER_IN;

const TITLE_FONT = {
	maxPt: 24,
	minPt: 10,
	charWidthRatio: 0.55,
	reservedHeightPt: 48,
} as const;

const LYRICS_FONT = {
	maxPt: 9,
	minPt: 6,
	lineHeight: 1.35,
} as const;

/** Zine print preview: per-track slider target/max before overflow shrink. */
export const ZINE_LYRICS_SIZE_SLIDER = {
	minPt: 6,
	maxPt: 16,
	stepPt: 0.5,
	defaultPt: 9,
} as const;

/** Per-track title horizontal squeeze (CSS `scaleX` on track title only); 1 = full width. */
export const ZINE_TEXT_CONDENSE = {
	default: 1,
	min: 0.5,
	max: 1,
	/** Slider step as scale delta (matches ~1% per step when displayed as percent). */
	step: 0.01,
} as const;

/** Lyrics should stay at least this fraction of the fitted primary-line title size (floor in `getZineLyricsMinFontSizePt`). */
const ZINE_LYRICS_MIN_TO_TITLE_RATIO = 0.65;

/** Preferred floor from title size; final zine shrink may go lower via hard min when needed. */
const ZINE_LYRICS_ABSOLUTE_MIN_PT = 6;

/**
 * Minimum lyrics font size (pt) from the measured/auto-fitted track title size.
 * Steps of 0.5pt to match `fitFontSizeToContainer`.
 */
export function getZineLyricsMinFontSizePt(titleFontSizePt: number): number {
	const fromTitle =
		Math.floor(titleFontSizePt * ZINE_LYRICS_MIN_TO_TITLE_RATIO * 2) / 2;

	return Math.max(ZINE_LYRICS_ABSOLUTE_MIN_PT, fromTitle);
}

export function countLyricsLines(
	lyrics: string,
	showSectionLabels: boolean,
): number {
	return lyrics.split("\n").filter((line) => {
		const trimmed = line.trim();

		if (trimmed === "") {
			return true;
		}

		if (/^\[.*\]$/.test(trimmed) && !showSectionLabels) {
			return false;
		}

		return true;
	}).length;
}

export function getZineContentBoxPt(): { widthPt: number; heightPt: number } {
	const widthPt =
		(ZINE_PAGE.widthIn - ZINE_PAGE.marginIn * 2) * POINTS_PER_INCH;
	const heightPt =
		(ZINE_PAGE.heightIn - ZINE_PAGE.marginIn * 2) * POINTS_PER_INCH;

	return { widthPt, heightPt };
}

export function computeSingleLineFontSize(
	text: string,
	maxWidthPt: number,
): number {
	const trimmed = text.trim();
	if (trimmed.length === 0) {
		return TITLE_FONT.maxPt;
	}

	let fontSizePt = TITLE_FONT.maxPt;

	while (fontSizePt > TITLE_FONT.minPt) {
		const estimatedWidthPt =
			trimmed.length * fontSizePt * TITLE_FONT.charWidthRatio;

		if (estimatedWidthPt <= maxWidthPt) {
			return fontSizePt;
		}

		fontSizePt -= 0.5;
	}

	return TITLE_FONT.minPt;
}

export function computeLyricsFontSize(
	lineCount: number,
	availableHeightPt: number,
	columnCount = 1,
	minPt: number = LYRICS_FONT.minPt,
): number {
	if (lineCount <= 0) {
		return LYRICS_FONT.maxPt;
	}

	const effectiveLineCount =
		columnCount > 1 ? Math.ceil(lineCount / columnCount) : lineCount;
	const maxByHeight =
		availableHeightPt / (effectiveLineCount * LYRICS_FONT.lineHeight);
	const fontSizePt = Math.min(LYRICS_FONT.maxPt, maxByHeight);

	return Math.max(minPt, Math.floor(fontSizePt * 2) / 2);
}

export type ZineSongLayoutOptions = {
	showSectionLabels: boolean;
	columnCount: number;
	showAlbumArt: boolean;
	showMetadata: boolean;
	hasMetadata: boolean;
	showUserNote: boolean;
	userNote?: string;
	showAbout: boolean;
	about?: string;
	showIntro: boolean;
};

function estimateExtraHeaderHeightPt(options: ZineSongLayoutOptions): number {
	let heightPt = 0;

	if (options.showAlbumArt) {
		heightPt += Math.max(ZINE_ALBUM_ART_IN * POINTS_PER_INCH, 52);
	} else {
		heightPt += 36;
	}

	heightPt += 16;

	if (options.showIntro) {
		heightPt += 52;
	}

	if (options.showUserNote && options.userNote?.trim()) {
		heightPt += Math.min(72, 12 + options.userNote.split("\n").length * 10);
	}

	if (options.showAbout && options.about?.trim()) {
		heightPt += Math.min(72, 12 + options.about.split("\n").length * 10);
	}

	return heightPt;
}

export function getSongPageLayout({
	title,
	lyrics,
	showSectionLabels,
	columnCount = 1,
	headerOptions,
}: {
	title: string;
	lyrics: string;
	showSectionLabels: boolean;
	columnCount?: number;
	headerOptions?: ZineSongLayoutOptions;
}): {
	titleFontSizePt: number;
	lyricsFontSizePt: number;
} {
	const { widthPt, heightPt } = getZineContentBoxPt();
	const extraHeaderPt = headerOptions
		? estimateExtraHeaderHeightPt(headerOptions)
		: 0;
	const lyricsHeightPt =
		heightPt -
		TITLE_FONT.reservedHeightPt -
		extraHeaderPt -
		ZINE_FOOTER_ZONE_HEIGHT_PT;

	const titleFontSizePt = computeSingleLineFontSize(title, widthPt);
	const lyricsMinPt = getZineLyricsMinFontSizePt(titleFontSizePt);

	return {
		titleFontSizePt,
		lyricsFontSizePt: computeLyricsFontSize(
			countLyricsLines(lyrics, showSectionLabels),
			Math.max(lyricsHeightPt, 120),
			columnCount,
			lyricsMinPt,
		),
	};
}

export function padZinePageCount(pageCount: number): number {
	if (pageCount <= 0) {
		return 4;
	}

	return Math.ceil(pageCount / 4) * 4;
}
