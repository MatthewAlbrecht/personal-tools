export type ZineDrcLogoCorner =
	| "top-left"
	| "top-right"
	| "bottom-left"
	| "bottom-right";

export const ZINE_DRC_LOGO_SRC = "/zine/denver-record-club-logo.png";

export const ZINE_DRC_LOGO_CORNER_OPTIONS: Array<{
	value: ZineDrcLogoCorner | "off";
	label: string;
}> = [
	{ value: "off", label: "Off" },
	{ value: "top-left", label: "Top left" },
	{ value: "top-right", label: "Top right" },
	{ value: "bottom-left", label: "Bottom left" },
	{ value: "bottom-right", label: "Bottom right" },
];

export function parseZineDrcLogoCorner(
	value: string | undefined | null,
): ZineDrcLogoCorner | undefined {
	if (
		value === "top-left" ||
		value === "top-right" ||
		value === "bottom-left" ||
		value === "bottom-right"
	) {
		return value;
	}
	return undefined;
}
