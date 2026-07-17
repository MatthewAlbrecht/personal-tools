import { ConvexHttpClient } from "convex/browser";
import type { NextApiRequest, NextApiResponse } from "next";
import { env } from "~/env.js";
import { todayInMountainTime } from "~/lib/birthdays/calendar";
import { getDueReminders } from "~/lib/birthdays/reminders";
import type { BirthdayPersonInput } from "~/lib/birthdays/types";
import { sendBirthdayDigestEmail } from "~/lib/email";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	if (req.method !== "GET" && req.method !== "POST") {
		return res.status(405).json({ error: "Method not allowed" });
	}

	if (req.headers.authorization !== `Bearer ${env.CRON_SECRET}`) {
		return res.status(401).json({ error: "Unauthorized" });
	}

	const userParam = req.query.user;
	const userId =
		typeof userParam === "string" && userParam.trim()
			? userParam.trim()
			: env.SPOTIFY_SYNC_USER_ID;

	try {
		const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
		const people = await convex.query(api.birthdays.listForReminders, {
			userId,
		});

		const today = todayInMountainTime(Date.now());
		const inputs: BirthdayPersonInput[] = people.map((person) => ({
			id: person._id,
			name: person.name,
			month: person.month,
			day: person.day,
			birthYear: person.birthYear,
			entryPoint: person.entryPoint,
		}));

		const due = getDueReminders(inputs, today);
		if (due.length === 0) {
			return res
				.status(200)
				.json({ ok: true, sent: false, reason: "nothing_due" });
		}

		const keys = due.map((item) => ({
			birthdayId: item.birthdayId as Id<"birthdays">,
			occurrenceYear: item.occurrenceYear,
			step: item.step,
		}));

		const undeliveredKeys = await convex.query(
			api.birthdays.filterUndelivered,
			{
				keys,
			},
		);
		const undeliveredSet = new Set(
			undeliveredKeys.map(
				(k) => `${k.birthdayId}:${k.occurrenceYear}:${k.step}`,
			),
		);
		const toSend = due.filter((item) =>
			undeliveredSet.has(
				`${item.birthdayId}:${item.occurrenceYear}:${item.step}`,
			),
		);

		if (toSend.length === 0) {
			return res.status(200).json({
				ok: true,
				sent: false,
				reason: "already_delivered",
			});
		}

		await sendBirthdayDigestEmail(toSend);

		await convex.mutation(api.birthdays.recordDeliveries, {
			userId,
			items: toSend.map((item) => ({
				birthdayId: item.birthdayId as Id<"birthdays">,
				occurrenceYear: item.occurrenceYear,
				step: item.step,
			})),
		});

		return res.status(200).json({
			ok: true,
			sent: true,
			count: toSend.length,
		});
	} catch (error) {
		console.error("❌ Birthday reminder cron failed:", error);
		return res.status(500).json({
			error: error instanceof Error ? error.message : "Unknown error",
		});
	}
}
