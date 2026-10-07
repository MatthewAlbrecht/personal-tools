import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "~/env";
import { verifySessionCookie } from "~/lib/session-cookie";

export async function POST(request: NextRequest) {
	try {
		const cookieStore = await cookies();
		const session = cookieStore.get("session")?.value;

		const verified = await verifySessionCookie(session, env.SESSION_SECRET);
		if (!verified || verified.username !== env.AUTH_USERNAME) {
			return NextResponse.json({ isAuthenticated: false }, { status: 401 });
		}

		return NextResponse.json({
			isAuthenticated: true,
			user: {
				id: verified.username,
				name: verified.username,
			},
		});
	} catch (error) {
		console.error("Auth validation error:", error);
		return NextResponse.json({ isAuthenticated: false }, { status: 500 });
	}
}
