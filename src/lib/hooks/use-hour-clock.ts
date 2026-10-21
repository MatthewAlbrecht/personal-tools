import { useMinuteClock } from "./use-minute-clock";

const HOUR = 60 * 60 * 1000;

/**
 * The current time, floored to the hour. For Convex queries that price over
 * days (Reference prices, cost to finish): their result can't change with
 * the minute, so they re-run once an hour instead of every minute.
 */
export function useHourClock(): number {
	const now = useMinuteClock();
	return now - (now % HOUR);
}
