import type { AddedWindow } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function resolveAddedWindow(
	window: AddedWindow,
	_now: number,
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
			return { afterMs: _now - ms, beforeMs: undefined };
		}
		case "calendar_month": {
			const afterMs = Date.UTC(window.year, window.month - 1, 1, 0, 0, 0);
			const beforeMs = Date.UTC(window.year, window.month, 1, 0, 0, 0);
			return { afterMs, beforeMs };
		}
	}
}
