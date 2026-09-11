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

export default crons;
