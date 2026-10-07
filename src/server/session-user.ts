import type { NextRequest } from "next/server";
import { env } from "~/env";
import { verifySessionCookie } from "~/lib/session-cookie";

/** Username from a validly signed session cookie, or null when absent/invalid. */
export async function getSessionUserId(
	request: NextRequest,
): Promise<string | null> {
	const session = await verifySessionCookie(
		request.cookies.get("session")?.value,
		env.SESSION_SECRET,
	);
	return session?.username ?? null;
}
