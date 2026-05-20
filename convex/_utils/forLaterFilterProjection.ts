import type { QueryCtx } from "../_generated/server";
import {
	buildParentKeysByChildKey,
	expandGenreKeysWithAncestorKeys,
} from "./rymGenreHierarchy";

/** Concatenate album + artist for Convex full-text search (`filterSearchText`). */
export function buildFilterSearchText(args: {
	albumName: string;
	artistName: string;
}): string {
	const parts = [args.albumName.trim(), args.artistName.trim()].filter(
		(s) => s.length > 0,
	);
	return parts.join("\n").trim();
}

export function parseReleaseYearFromIsoDate(
	releaseDate: string | undefined,
): number | undefined {
	if (!releaseDate || releaseDate.length < 4) {
		return undefined;
	}
	const yearStr = releaseDate.slice(0, 4);
	if (!/^\d{4}$/.test(yearStr)) {
		return undefined;
	}
	const year = Number.parseInt(yearStr, 10);
	return Number.isFinite(year) ? year : undefined;
}

export function buildDirectFilterGenreKeys(
	primaryGenres: Array<{ key: string }>,
	secondaryGenres: Array<{ key: string }>,
): string[] {
	const keys = new Set<string>();
	for (const t of primaryGenres) {
		keys.add(t.key);
	}
	for (const t of secondaryGenres) {
		keys.add(t.key);
	}
	return [...keys].sort();
}

/** @deprecated Use {@link buildDirectFilterGenreKeys}. */
export const buildFilterGenreKeysSorted = buildDirectFilterGenreKeys;

export function buildFilterGenreKeysSortedWithAncestors(
	directKeys: string[],
	parentKeysByChild: Map<string, string[]>,
): string[] {
	return expandGenreKeysWithAncestorKeys(directKeys, parentKeysByChild);
}

export async function loadRymGenreParentKeysByChild(
	ctx: Pick<QueryCtx, "db">,
): Promise<Map<string, string[]>> {
	const relationships = await ctx.db
		.query("rateYourMusicGenreRelationships")
		.collect();

	return buildParentKeysByChildKey(relationships);
}

export function buildFilterDescriptorKeysSorted(
	descriptors: Array<{ key: string }>,
): string[] {
	const keys = new Set<string>();
	for (const t of descriptors) {
		keys.add(t.key);
	}
	return [...keys].sort();
}
