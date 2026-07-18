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
