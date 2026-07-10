/** Convex-side copy of `src/lib/smart-playlists/added-window.ts` (no src imports). */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type SmartPlaylistAddedWindow =
	| { type: "absolute"; afterMs?: number; beforeMs?: number }
	| { type: "relative"; unit: "days" | "months"; amount: number }
	| { type: "calendar_month"; year: number; month: number };

export function resolveAddedWindow(
	window: SmartPlaylistAddedWindow,
	now: number,
): { afterMs?: number; beforeMs?: number } | null {
	switch (window.type) {
		case "absolute":
			return { afterMs: window.afterMs, beforeMs: window.beforeMs };
		case "relative": {
			const ms =
				window.unit === "days"
					? window.amount * MS_PER_DAY
					: // v1 approximation: treat each month as 30 days
						window.amount * 30 * MS_PER_DAY;
			return { afterMs: now - ms, beforeMs: undefined };
		}
		case "calendar_month": {
			const afterMs = Date.UTC(window.year, window.month - 1, 1, 0, 0, 0);
			const beforeMs = Date.UTC(window.year, window.month, 1, 0, 0, 0);
			return { afterMs, beforeMs };
		}
	}
}
