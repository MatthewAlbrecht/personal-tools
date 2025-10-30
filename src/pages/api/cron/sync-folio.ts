import { ConvexHttpClient } from "convex/browser";
import type { NextApiRequest, NextApiResponse } from "next";
import { env } from "~/env";
import { sendNewReleasesEmail } from "~/lib/email";
import { api } from "../../../../convex/_generated/api";

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	// Only allow POST requests
	if (req.method !== "GET") {
		return res.status(405).json({ error: "Method not allowed" });
	}

	// Verify this is a legitimate cron request
	const authHeader = req.headers.authorization;
	const expectedAuth = `Bearer ${env.CRON_SECRET}`;

	if (!authHeader || authHeader !== expectedAuth) {
		return res.status(401).json({ error: "Unauthorized" });
	}

	try {
		console.log("🔄 Starting scheduled Folio Society sync..");

		// Create Convex client
		const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);

		// Perform the sync
		console.log("🔄 Calling syncReleases mutation...");
		const result = await convex.action(api.folioSocietyReleases.syncReleases, {
			enrich: true,
			detailsTtlHours: 24,
			maxConcurrent: 10,
		});

		console.log("✅ Sync completed:", JSON.stringify(result, null, 2));
		console.log("📊 Sync details:");
		console.log(`   - Total IDs checked: ${result.totalIds}`);
		console.log(`   - Products synced: ${result.syncedCount}`);
		console.log(`   - New releases found: ${result.newReleasesCount}`);
		console.log(`   - Range expanded: ${result.rangeExpanded}`);
		if (result.newReleases && result.newReleases.length > 0) {
			console.log(
				"🆕 New releases:",
				result.newReleases.map((r) => `${r.name} (${r.sku})`),
			);
		}

		// Send email notification if new releases were found
		if (result.newReleasesCount > 0) {
			try {
				await sendNewReleasesEmail(result);
				console.log(
					`📧 Email notification sent for ${result.newReleasesCount} new releases`,
				);
			} catch (emailError) {
				console.error("❌ Failed to send email notification:", emailError);
				// Don't fail the entire sync if email fails
			}
		}

		res.status(200).json({
			success: true,
			result,
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		console.error("❌ Cron sync failed:", error);

		res.status(500).json({
			error: "Sync failed",
			message: error instanceof Error ? error.message : "Unknown error",
			timestamp: new Date().toISOString(),
		});
	}
}
