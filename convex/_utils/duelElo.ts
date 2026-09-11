/** Keep in sync with `src/lib/duel-elo.ts`. */

export const DEFAULT_ELO = 1500;

const DEFAULT_K = 32;

export function eloUpdate(
	a: number,
	b: number,
	winner: "a" | "b",
	k: number = DEFAULT_K,
): { a: number; b: number } {
	const expectedA = 1 / (1 + 10 ** ((b - a) / 400));
	const expectedB = 1 - expectedA;
	const scoreA = winner === "a" ? 1 : 0;
	const scoreB = winner === "b" ? 1 : 0;

	return {
		a: Math.round(a + k * (scoreA - expectedA)),
		b: Math.round(b + k * (scoreB - expectedB)),
	};
}
