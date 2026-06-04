"use client";

import {
	type RefObject,
	useCallback,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import {
	ZINE_FOOTER_ZONE_CSS_PX,
	ZINE_LYRICS_SIZE_SLIDER,
} from "~/lib/zine/zine-layout";
import {
	fitFontSizeToContainer,
	useZinePrintRemeasure,
} from "./zine-print-remeasure";

export type ZineLyricsColumnMode = 1 | 2;

export function useZineSongLyricsFit({
	lyrics,
	targetFontSizePt = ZINE_LYRICS_SIZE_SLIDER.defaultPt,
	contentKey,
	lyricsColumnMode,
	showCredits = true,
}: {
	lyrics: string;
	/** Slider target/max; fit shrinks down to slider min pt if overflowing. */
	targetFontSizePt?: number;
	contentKey: string;
	lyricsColumnMode: ZineLyricsColumnMode;
	showCredits?: boolean;
}): {
	pageRef: RefObject<HTMLElement | null>;
	headerRef: RefObject<HTMLDivElement | null>;
	/** Outer clip shell (height constrained). */
	lyricsClipRef: RefObject<HTMLDivElement | null>;
	/** Column + font-size layer; passed to vertical fit helpers. */
	lyricsScaledContentRef: RefObject<HTMLDivElement | null>;
	lyricsHeightPx: number;
	fontSizePt: number;
	columnCount: 1 | 2;
} {
	const pageRef = useRef<HTMLElement | null>(null);
	const headerRef = useRef<HTMLDivElement | null>(null);
	const lyricsClipRef = useRef<HTMLDivElement | null>(null);
	const lyricsScaledContentRef = useRef<HTMLDivElement | null>(null);
	const [lyricsHeightPx, setLyricsHeightPx] = useState(0);
	const [fontSizePt, setFontSizePt] = useState(targetFontSizePt);

	// biome-ignore lint/correctness/useExhaustiveDependencies: lexical body reads layout from refs/DOM only; deps list layout-driving props so the callback identity changes when fit inputs change.
	const remeasure = useCallback(() => {
		const page = pageRef.current;
		const header = headerRef.current;
		const lyricsClip = lyricsClipRef.current;
		const lyricsMeasuring = lyricsScaledContentRef.current;
		if (!page || !header || !lyricsClip || !lyricsMeasuring) {
			return;
		}

		const pageStyles = getComputedStyle(page);
		const paddingTop = Number.parseFloat(pageStyles.paddingTop) || 0;
		const paddingBottom = Number.parseFloat(pageStyles.paddingBottom) || 0;
		const innerHeight = page.clientHeight - paddingTop - paddingBottom;
		const headerHeight = header.getBoundingClientRect().height;
		const footerReservePx = showCredits ? ZINE_FOOTER_ZONE_CSS_PX : 0;
		const nextLyricsHeightPx = Math.max(
			24,
			Math.floor(innerHeight - headerHeight - footerReservePx),
		);

		lyricsClip.style.height = `${nextLyricsHeightPx}px`;
		setLyricsHeightPx(nextLyricsHeightPx);

		const minFontSizePt = ZINE_LYRICS_SIZE_SLIDER.minPt;

		const nextFontSizePt = fitFontSizeToContainer({
			container: lyricsMeasuring,
			initialFontSizePt: targetFontSizePt,
			minFontSizePt,
			mode: "multiline",
		});

		setFontSizePt(nextFontSizePt);
	}, [contentKey, lyrics, lyricsColumnMode, showCredits, targetFontSizePt]);

	useLayoutEffect(() => {
		remeasure();
	}, [remeasure]);

	useZinePrintRemeasure(remeasure);

	return {
		pageRef,
		headerRef,
		lyricsClipRef,
		lyricsScaledContentRef,
		lyricsHeightPx,
		fontSizePt,
		columnCount: lyricsColumnMode,
	};
}
