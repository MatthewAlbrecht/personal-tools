#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

try {
	const envFile = readFileSync(join(process.cwd(), ".env.local"), "utf-8");
	for (const line of envFile.split("\n")) {
		const match = line.match(/^([^#=]+)=(.*)$/);
		if (match?.[1] && match[2] !== undefined) {
			const key = match[1];
			let value = match[2].trim();
			if (
				(value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))
			) {
				value = value.slice(1, -1);
			}
			process.env[key.trim()] = value;
		}
	}
} catch {
	console.warn("Could not load .env.local, using existing env vars");
}

const devUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const prodUrl = process.env.NEXT_PUBLIC_CONVEX_PROD_URL;

if (!devUrl || !prodUrl) {
	console.error(
		"Missing NEXT_PUBLIC_CONVEX_URL or NEXT_PUBLIC_CONVEX_PROD_URL",
	);
	process.exit(1);
}

const devClient = new ConvexHttpClient(devUrl);
const prodClient = new ConvexHttpClient(prodUrl);

async function syncCreditDefaults() {
	console.log("Fetching credit defaults from dev...");
	const devRows = await devClient.query(api.geniusCreditLabels.listForSync, {});
	console.log(`Found ${devRows.length} credit label rows in dev\n`);

	let created = 0;
	let updated = 0;

	for (const row of devRows) {
		const result = await prodClient.mutation(
			api.geniusCreditLabels.upsertForSync,
			row,
		);

		if (result === "created") {
			created += 1;
			console.log(`Created: ${row.label}`);
		} else {
			updated += 1;
			console.log(`Updated: ${row.label}`);
		}
	}

	console.log("\nCredit defaults sync complete!");
	console.log(`   Created: ${created}`);
	console.log(`   Updated: ${updated}`);
	console.log(`   Total: ${devRows.length}`);
}

syncCreditDefaults().catch((error) => {
	console.error("Credit defaults sync failed:", error);
	process.exit(1);
});
