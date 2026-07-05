export type ZineIntroVerticalAlign = "top" | "center";

export type ZineIntroSettings = {
	paragraphSpacingPt: number;
	marginPt: number;
	verticalAlign: ZineIntroVerticalAlign;
	fontSizePt: number;
};

export const ZINE_INTRO_DEFAULTS: ZineIntroSettings = {
	paragraphSpacingPt: 8,
	marginPt: 12,
	verticalAlign: "top",
	fontSizePt: 10,
};

export const ZINE_INTRO_SPACING_SLIDER = {
	minPt: 0,
	maxPt: 72,
	stepPt: 1,
	defaultPt: ZINE_INTRO_DEFAULTS.paragraphSpacingPt,
} as const;

export const ZINE_INTRO_MARGIN_SLIDER = {
	minPt: 0,
	maxPt: 48,
	stepPt: 1,
	defaultPt: ZINE_INTRO_DEFAULTS.marginPt,
} as const;

export const ZINE_INTRO_FONT_SIZE_SLIDER = {
	minPt: 8,
	maxPt: 16,
	stepPt: 0.5,
	defaultPt: ZINE_INTRO_DEFAULTS.fontSizePt,
} as const;

export function resolveZineIntroSettings(
	stored?: Partial<ZineIntroSettings>,
): ZineIntroSettings {
	return {
		paragraphSpacingPt:
			stored?.paragraphSpacingPt ?? ZINE_INTRO_DEFAULTS.paragraphSpacingPt,
		marginPt: stored?.marginPt ?? ZINE_INTRO_DEFAULTS.marginPt,
		verticalAlign: stored?.verticalAlign ?? ZINE_INTRO_DEFAULTS.verticalAlign,
		fontSizePt: stored?.fontSizePt ?? ZINE_INTRO_DEFAULTS.fontSizePt,
	};
}
