import { type NextRequest, NextResponse } from "next/server";
import { callYugiohAutomation } from "~/server/convex-server";
import { rejectUnlessExtension } from "~/server/extension-ingest";

// Automated browser runs (docs/yugioh/automation.md). The script on my Mac and
// the extension in the automation Chrome profile both call this with the
// extension secret. Each body names its step (`op`) and is forwarded over the
// secret-guarded Convex server channel, whose functions check every field.
export async function POST(request: NextRequest): Promise<NextResponse> {
	const rejected = rejectUnlessExtension(request);
	if (rejected) return rejected;

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}
	if (typeof body !== "object" || body === null || !("op" in body)) {
		return NextResponse.json(
			{ error: "Expected { op: ... }" },
			{ status: 400 },
		);
	}

	try {
		return NextResponse.json(await callYugiohAutomation(body));
	} catch (error) {
		console.error("[yugioh/automation] forward to Convex failed", error);
		return NextResponse.json(
			{ error: "Couldn't reach the tracker's database" },
			{ status: 502 },
		);
	}
}
