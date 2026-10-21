import { NextResponse } from "next/server";
import { env } from "~/env.js";

/**
 * Checks the extension's shared secret (`Authorization: Bearer
 * RYM_EXTENSION_INGEST_SECRET`) on a Yu-Gi-Oh capture. Returns the error
 * response to send, or null when the request may go on.
 */
export function rejectUnlessExtension(request: Request): NextResponse | null {
	if (!env.RYM_EXTENSION_INGEST_SECRET) {
		return NextResponse.json(
			{ error: "RYM_EXTENSION_INGEST_SECRET is not set on the server" },
			{ status: 503 },
		);
	}
	const authHeader = request.headers.get("authorization");
	const bearer = authHeader?.startsWith("Bearer ")
		? authHeader.slice("Bearer ".length).trim()
		: null;
	if (!bearer || bearer !== env.RYM_EXTENSION_INGEST_SECRET) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	return null;
}
