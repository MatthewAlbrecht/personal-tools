/**
 * Mirrors `src/lib/album-enrichment/{types,slices}.ts`. Convex cannot import
 * from `src/lib`, so this logic is duplicated here — keep both in sync.
 */

export type EnrichmentSliceKey =
	| "artistContext"
	| "whyListen"
	| "coverDescriptors"
	| "occasions";

export type SlicePresence = Partial<
	Record<EnrichmentSliceKey, { updatedAt: number }>
>;

export type EnrichmentTag = {
	key: string;
	label: string;
};

export const REQUIRED_ENRICHMENT_SLICES: EnrichmentSliceKey[] = [
	"artistContext",
	"whyListen",
	"coverDescriptors",
	"occasions",
];

export function missingEnrichmentSlices(
	slices: SlicePresence | undefined,
): EnrichmentSliceKey[] {
	return REQUIRED_ENRICHMENT_SLICES.filter((key) => slices?.[key] == null);
}

export function isEnrichmentComplete(
	slices: SlicePresence | undefined,
): boolean {
	return missingEnrichmentSlices(slices).length === 0;
}

export function normalizeEnrichmentTagKey(label: string): string {
	return label
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function normalizeEnrichmentTags(
	tags: Array<{ label: string }>,
): EnrichmentTag[] {
	const seen = new Set<string>();
	const out: EnrichmentTag[] = [];
	for (const tag of tags) {
		const label = tag.label.replace(/\s+/g, " ").trim();
		if (!label) continue;
		const key = normalizeEnrichmentTagKey(label);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		out.push({ key, label });
	}
	return out;
}
