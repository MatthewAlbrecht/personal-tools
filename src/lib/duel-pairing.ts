import { DEFAULT_ELO } from "./duel-elo";

/**
 * Mild Elo prior from manual rating (1–15).
 * Midpoint 8 → +0; rating 15 → +75; rating 1 → −75.
 * Keep in sync with convex/_utils + albumDuels seedEloFromRating.
 */
export function seedEloFromRating(rating: number): number {
	const offset = Math.round(((rating - 8) / 7) * 75);
	const clamped = Math.max(-75, Math.min(75, offset));
	return DEFAULT_ELO + clamped;
}

export type DuelPoolItem = {
	userAlbumId: string;
	albumId: string;
	rating: number;
	title?: string;
	artist?: string;
	imageUrl?: string;
};

/** Mulberry32 unit float from seed + salt (matches Convex pairing). */
export function seededUnit(seed: number, salt: number): number {
	let t = (seed + salt * 0x9e3779b9) >>> 0;
	t = Math.imul(t ^ (t >>> 15), t | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function effectiveElo(
	item: DuelPoolItem,
	eloByUserAlbumId: Map<string, number>,
): number {
	return eloByUserAlbumId.get(item.userAlbumId) ?? seedEloFromRating(item.rating);
}

/**
 * Client pairing: seed-picked anchor, prefer partner within ±100 Elo.
 * No network — call after each skip/pick with a new seed.
 */
export function pickDuelPair(
	pool: DuelPoolItem[],
	eloByUserAlbumId: Map<string, number>,
	seed: number,
): { a: DuelPoolItem; b: DuelPoolItem } | null {
	if (pool.length < 2) return null;

	const anchorIndex = Math.floor(seededUnit(seed, 1) * pool.length);
	const a = pool[anchorIndex];
	if (!a) return null;

	const aElo = effectiveElo(a, eloByUserAlbumId);
	const rest = pool.filter((_, i) => i !== anchorIndex);
	if (rest.length === 0) return null;

	const CLOSE_BAND = 100;
	const close = rest.filter((row) => {
		const elo = effectiveElo(row, eloByUserAlbumId);
		return Math.abs(elo - aElo) <= CLOSE_BAND;
	});
	const candidates = close.length > 0 ? close : rest;

	const sorted = [...candidates].sort((x, y) => {
		const dx = Math.abs(effectiveElo(x, eloByUserAlbumId) - aElo);
		const dy = Math.abs(effectiveElo(y, eloByUserAlbumId) - aElo);
		if (dx !== dy) return dx - dy;
		return x.userAlbumId.localeCompare(y.userAlbumId);
	});

	const pickIndex = Math.floor(
		seededUnit(seed, 2) * Math.min(3, sorted.length),
	);
	const b = sorted[pickIndex] ?? sorted[0];
	if (!b) return null;

	return { a, b };
}
