import { render } from "@react-email/components";
import { Resend } from "resend";
import { env } from "~/env.js";
import { buildDigestSubject } from "./birthdays/reminders";
import type { DueReminder } from "./birthdays/types";
import { BirthdayDigestEmail } from "./emails/birthday-digest";
import { FolioNotificationEmail } from "./emails/folio-notification";

const resend = new Resend(env.RESEND_API_KEY);

// Import types from the React Email component
type NewRelease = {
	id: number;
	name: string;
	sku: string;
	url: string;
	price?: number | null;
	image?: string | null;
};

type SyncResult = {
	syncedCount: number;
	totalIds: number;
	rangeExpanded?: boolean;
	newEndId?: number;
	newReleases?: NewRelease[];
};

export async function sendNewReleasesEmail(syncResult: SyncResult) {
	const newReleases = syncResult.newReleases || [];

	if (newReleases.length === 0) {
		console.log("📧 No new releases found, skipping email notification");
		return;
	}

	try {
		console.log(
			`📧 Sending email notification for ${newReleases.length} new releases...`,
		);

		const result = await resend.emails.send({
			from: "Folio Society Tracker <notifications@moooose.dev>",
			to: env.NOTIFICATION_EMAIL,
			subject: `🏛️ ${newReleases.length} New Folio Society Release${
				newReleases.length > 1 ? "s" : ""
			} Found!`,
			react: (
				<FolioNotificationEmail
					newReleases={newReleases}
					syncResult={syncResult}
				/>
			),
		});

		console.log("✅ Email sent successfully:", result.data?.id);
		return result;
	} catch (error) {
		console.error("❌ Failed to send email notification:", error);
		throw error;
	}
}

export async function sendBirthdayDigestEmail(dueItems: DueReminder[]) {
	const subject = buildDigestSubject(dueItems);
	if (!subject) {
		console.log("📧 No birthday reminders due, skipping email");
		return;
	}

	try {
		console.log(`📧 Sending birthday digest (${dueItems.length} items)...`);
		const result = await resend.emails.send({
			from: "Birthday Tracker <notifications@moooose.dev>",
			to: env.NOTIFICATION_EMAIL,
			subject,
			react: <BirthdayDigestEmail dueItems={dueItems} />,
		});
		console.log("✅ Birthday digest sent:", result.data?.id);
		return result;
	} catch (error) {
		console.error("❌ Failed to send birthday digest:", error);
		throw error;
	}
}
