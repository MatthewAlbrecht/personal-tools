export type ZineCoverTextAnchor =
	| "top-left"
	| "top-center"
	| "top-right"
	| "center-left"
	| "center"
	| "center-right"
	| "bottom-left"
	| "bottom-center"
	| "bottom-right";

export type ZineCoverTextAlign = "left" | "center" | "right";

export type ZineCoverTextLayout = {
	anchor: ZineCoverTextAnchor;
	textAlign: ZineCoverTextAlign;
	offsetXIn: number;
	offsetYIn: number;
};

export const ZINE_COVER_TEXT_ANCHORS: ZineCoverTextAnchor[] = [
	"top-left",
	"top-center",
	"top-right",
	"center-left",
	"center",
	"center-right",
	"bottom-left",
	"bottom-center",
	"bottom-right",
];

export const ZINE_COVER_TEXT_DEFAULTS: ZineCoverTextLayout = {
	anchor: "center",
	textAlign: "center",
	offsetXIn: 0,
	offsetYIn: 0,
};

export const ZINE_COVER_TEXT_OFFSET_SLIDER = {
	minIn: -0.75,
	maxIn: 0.75,
	stepIn: 0.05,
	defaultIn: 0,
} as const;

export function resolveZineCoverTextLayout(
	stored?: Partial<ZineCoverTextLayout> | null,
): ZineCoverTextLayout {
	return {
		anchor: stored?.anchor ?? ZINE_COVER_TEXT_DEFAULTS.anchor,
		textAlign: stored?.textAlign ?? ZINE_COVER_TEXT_DEFAULTS.textAlign,
		offsetXIn: clampCoverOffset(stored?.offsetXIn ?? ZINE_COVER_TEXT_DEFAULTS.offsetXIn),
		offsetYIn: clampCoverOffset(stored?.offsetYIn ?? ZINE_COVER_TEXT_DEFAULTS.offsetYIn),
	};
}

export function coverTextLayoutFromStoredFields(fields: {
	zineCoverTextAnchor?: ZineCoverTextAnchor;
	zineCoverTextAlign?: ZineCoverTextAlign;
	zineCoverTextOffsetXIn?: number;
	zineCoverTextOffsetYIn?: number;
}): Partial<ZineCoverTextLayout> {
	return {
		anchor: fields.zineCoverTextAnchor,
		textAlign: fields.zineCoverTextAlign,
		offsetXIn: fields.zineCoverTextOffsetXIn,
		offsetYIn: fields.zineCoverTextOffsetYIn,
	};
}

export function coverAnchorToFlex(anchor: ZineCoverTextAnchor): {
	alignItems: "flex-start" | "center" | "flex-end";
	justifyContent: "flex-start" | "center" | "flex-end";
} {
	if (anchor === "center") {
		return { alignItems: "center", justifyContent: "center" };
	}

	const [vertical, horizontal] = anchor.split("-") as [
		"top" | "center" | "bottom",
		"left" | "center" | "right",
	];

	const alignItems =
		vertical === "top"
			? "flex-start"
			: vertical === "bottom"
				? "flex-end"
				: "center";

	const justifyContent =
		horizontal === "left"
			? "flex-start"
			: horizontal === "right"
				? "flex-end"
				: "center";

	return { alignItems, justifyContent };
}

export function coverTextLayoutToStyleProperties(
	layout: ZineCoverTextLayout,
): Record<string, string> {
	const { alignItems, justifyContent } = coverAnchorToFlex(layout.anchor);
	const stackAlign =
		layout.textAlign === "left"
			? "flex-start"
			: layout.textAlign === "right"
				? "flex-end"
				: "center";

	return {
		"--zine-cover-anchor-align": alignItems,
		"--zine-cover-anchor-justify": justifyContent,
		"--zine-cover-stack-align": stackAlign,
		"--zine-cover-offset-x-in": String(layout.offsetXIn),
		"--zine-cover-offset-y-in": String(layout.offsetYIn),
	};
}

function clampCoverOffset(value: number): number {
	const { minIn, maxIn, stepIn } = ZINE_COVER_TEXT_OFFSET_SLIDER;
	const clamped = Math.min(maxIn, Math.max(minIn, value));
	return Math.round(clamped / stepIn) * stepIn;
}
