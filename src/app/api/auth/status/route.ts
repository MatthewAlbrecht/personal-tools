import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "~/env";
import { verifySessionCookie } from "~/lib/session-cookie";

export async function GET() {
	try {
		const cookieStore = await cookies();
		const session = cookieStore.get("session")?.value;

		const verified = await verifySessionCookie(session, env.SESSION_SECRET);
		if (verified) {
			return NextResponse.json({
				isAuthenticated: true,
				userId: verified.username,
			});
		}

		return NextResponse.json({ isAuthenticated: false, userId: null });
	} catch (error) {
		console.error("Auth status check error:", error);
		return NextResponse.json({ isAuthenticated: false, userId: null });
	}
}
