"use client";

import {
	type RefObject,
	useCallback,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import {
	fitFontSizeToContainer,
	useZinePrintRemeasure,
} from "./zine-print-remeasure";

export function useAutoFitText({
	initialFontSizePt,
	minFontSizePt,
	mode,
	contentKey,
}: {
	initialFontSizePt: number;
	minFontSizePt: number;
	mode: "single-line" | "multiline";
	contentKey: string;
}): {
	containerRef: RefObject<HTMLDivElement | null>;
	fontSizePt: number;
} {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [fontSizePt, setFontSizePt] = useState(initialFontSizePt);

	// contentKey forces remeasure when song content or display options change
	// biome-ignore lint/correctness/useExhaustiveDependencies: contentKey is an intentional remeasure trigger
	const remeasure = useCallback(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}

		const nextFontSizePt = fitFontSizeToContainer({
			container,
			initialFontSizePt,
			minFontSizePt,
			mode,
		});
		setFontSizePt(nextFontSizePt);
	}, [contentKey, initialFontSizePt, minFontSizePt, mode]);

	useLayoutEffect(() => {
		remeasure();
	}, [remeasure]);

	useZinePrintRemeasure(remeasure);

	return {
		containerRef,
		fontSizePt,
	};
}
