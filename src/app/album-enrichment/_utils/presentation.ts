export type EnrichmentSliceKey =
	| "artistContext"
	| "whyListen"
	| "coverDescriptors"
	| "occasions";

const SLICE_KEYS: EnrichmentSliceKey[] = [
	"artistContext",
	"whyListen",
	"coverDescriptors",
	"occasions",
];

const SLICE_LABELS: Record<EnrichmentSliceKey, string> = {
	artistContext: "Artist context",
	whyListen: "Why listen",
	coverDescriptors: "Cover descriptors",
	occasions: "Occasions",
};

export function getSliceLabel(key: EnrichmentSliceKey): string {
	return SLICE_LABELS[key];
}

export function buildMissingSliceEntries(
	counts: Record<EnrichmentSliceKey, number>,
): Array<{ key: EnrichmentSliceKey; label: string; count: number }> {
	return SLICE_KEYS.map((key) => ({
		key,
		label: getSliceLabel(key),
		count: counts[key],
	}));
}

export function formatScanDisclosure({
	scanned,
	capped,
}: {
	scanned: number;
	capped: boolean;
}): string {
	const formattedCount = scanned.toLocaleString("en-US");
	return capped
		? `Scanned ${formattedCount} active records · capped result`
		: `Scanned all ${formattedCount} active records`;
}
