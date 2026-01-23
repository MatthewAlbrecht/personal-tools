import { internalMutation, internalQuery } from "../_generated/server";

/**
 * Migration: High/Low (1-10) → High/Med/Low (1-15)
 *
 * Old High stays High, old Low stays Low, Med tier starts empty.
 *
 * Old → New mapping:
 * 10→15, 9→13  (Holy Moly)
 * 8→12, 7→10   (Really Enjoyed)
 * 6→9, 5→7    (Good)
 * 4→6, 3→4    (Fine)
 * 2→3, 1→1    (Actively Bad)
 */

const RATING_MAP: Record<number, number> = {
	10: 15,
	9: 13, // Holy Moly: High→15, Low→13
	8: 12,
	7: 10, // Really Enjoyed: High→12, Low→10
	6: 9,
	5: 7, // Good: High→9, Low→7
	4: 6,
	3: 4, // Fine: High→6, Low→4
	2: 3,
	1: 1, // Actively Bad: High→3, Low→1
};

/**
 * Step 1: Get current state BEFORE migration (for verification)
 * Run this FIRST and save the output!
 */
export const getRatingSnapshot = internalQuery({
	handler: async (ctx) => {
		const userAlbums = await ctx.db.query("userAlbums").collect();
		const withRatings = userAlbums.filter((ua) => ua.rating !== undefined);

		const breakdown: Record<number, number> = {};
		for (const ua of withRatings) {
			const r = ua.rating!;
			breakdown[r] = (breakdown[r] ?? 0) + 1;
		}

		return {
			totalWithRatings: withRatings.length,
			breakdown,
			sampleIds: withRatings.slice(0, 5).map((ua) => ({
				id: ua._id,
				rating: ua.rating,
			})),
		};
	},
});

/**
 * Step 2: Run the actual migration
 * This converts old 1-10 ratings to new 1-15 scale
 */
export const migrateRatingsToThreeTier = internalMutation({
	handler: async (ctx) => {
		const userAlbums = await ctx.db.query("userAlbums").collect();
		let migrated = 0;
		let skipped = 0;

		for (const ua of userAlbums) {
			if (ua.rating !== undefined) {
				const newRating = RATING_MAP[ua.rating];
				if (newRating !== undefined) {
					await ctx.db.patch(ua._id, { rating: newRating });
					migrated++;
				} else {
					// Already migrated or unknown rating (ratings > 10 aren't in map)
					skipped++;
				}
			}
		}

		return { migrated, skipped };
	},
});

/**
 * Rollback: Reverse the migration if something goes wrong
 * Converts 1-15 ratings back to 1-10 scale
 */
const REVERSE_MAP: Record<number, number> = {
	15: 10,
	13: 9, // Holy Moly
	12: 8,
	10: 7, // Really Enjoyed
	9: 6,
	7: 5, // Good
	6: 4,
	4: 3, // Fine
	3: 2,
	1: 1, // Actively Bad
};

export const rollbackRatings = internalMutation({
	handler: async (ctx) => {
		const userAlbums = await ctx.db.query("userAlbums").collect();
		let rolledBack = 0;
		let skipped = 0;

		for (const ua of userAlbums) {
			if (ua.rating !== undefined) {
				const oldRating = REVERSE_MAP[ua.rating];
				if (oldRating !== undefined) {
					await ctx.db.patch(ua._id, { rating: oldRating });
					rolledBack++;
				} else {
					// Med tier ratings (14, 11, 8, 5, 2) or unknown - skip
					skipped++;
				}
			}
		}

		return { rolledBack, skipped };
	},
});


