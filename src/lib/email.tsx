import { Resend } from "resend";
import { env } from "~/env.js";
import { ExampleEmail } from "./emails/example-email";

const resend = new Resend(env.RESEND_API_KEY);

type ExampleEmailData = {
	userName: string;
	message: string;
};

/**
 * Example function to send an email using Resend and React Email
 * 
 * Usage:
 * await sendExampleEmail({
 *   userName: "John Doe",
 *   message: "This is an example message"
 * });
 */
export async function sendExampleEmail(data: ExampleEmailData) {
	try {
		console.log(`📧 Sending example email to ${data.userName}...`);

		const result = await resend.emails.send({
			from: "Your App <notifications@yourdomain.com>",
			to: env.NOTIFICATION_EMAIL,
			subject: `Hello ${data.userName}!`,
			react: <ExampleEmail userName={data.userName} message={data.message} />,
		});

		console.log("✅ Email sent successfully:", result.data?.id);
		return result;
	} catch (error) {
		console.error("❌ Failed to send email:", error);
		throw error;
	}
}
