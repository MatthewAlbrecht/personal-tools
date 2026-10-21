import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Quiet Sunday morning UTC (01:00 Eastern / 05:00 UTC) — after Saturday listening settles.
crons.weekly(
	"manual ranking Sunday snapshots",
	{ dayOfWeek: "sunday", hourUTC: 5, minuteUTC: 0 },
	internal.rankingSnapshots.orchestrateSunday,
	{},
);

// Yu-Gi-Oh Per-copy prices: Frankfurter publishes new rates once a day.
crons.daily(
	"yugioh exchange rates",
	{ hourUTC: 6, minuteUTC: 0 },
	internal.yugioh.pricing.refreshExchangeRates,
	{},
);

// Yu-Gi-Oh title reads that failed: retried when due, up to a few attempts.
crons.interval(
	"yugioh retry failed title reads",
	{ hours: 1 },
	internal.yugioh.titleReadRetry.retryFailedTitleReads,
	{},
);

export default crons;
