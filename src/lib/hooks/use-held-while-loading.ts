import { useState } from "react";

/**
 * Keeps showing the last loaded value while a query reloads with new args
 * (such as a clock tick), instead of flashing back to a loading state. The
 * held value is dropped when `key` changes, so another record never shows
 * its predecessor's data.
 */
export function useHeldWhileLoading<T>(
	value: T | undefined,
	key: string,
): T | undefined {
	const [held, setHeld] = useState<{ key: string; value: T } | null>(null);
	if (
		value !== undefined &&
		(held === null || held.key !== key || held.value !== value)
	) {
		setHeld({ key, value });
	}
	if (value !== undefined) return value;
	return held?.key === key ? held.value : undefined;
}
