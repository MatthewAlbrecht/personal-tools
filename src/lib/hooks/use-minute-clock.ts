import { useEffect, useState } from "react";

const MINUTE = 60_000;

/**
 * The current time, floored to the minute and updated each minute. Pass it to
 * Convex queries that judge by time (a query can't read the clock): every
 * caller in the same minute sends the same value, so subscriptions are shared.
 */
export function useMinuteClock(): number {
	const [now, setNow] = useState(() => floorToMinute(Date.now()));

	// Syncs with the system clock: ticks at the start of each minute.
	useEffect(() => {
		let timer: ReturnType<typeof setTimeout>;
		function schedule(): void {
			const current = Date.now();
			timer = setTimeout(
				() => {
					setNow(floorToMinute(Date.now()));
					schedule();
				},
				MINUTE - (current % MINUTE),
			);
		}
		schedule();
		return () => clearTimeout(timer);
	}, []);

	return now;
}

function floorToMinute(time: number): number {
	return time - (time % MINUTE);
}
