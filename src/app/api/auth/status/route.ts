import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
	try {
		const cookieStore = await cookies();
		const session = cookieStore.get("session")?.value;

		if (session) {
			// Validate the session token
			try {
				const decoded = Buffer.from(session, "base64url").toString();
				const parts = decoded.split(":");
				const username = parts[0];
				const timestamp = parts[1];

				if (!username || !timestamp) {
					return NextResponse.json({ isAuthenticated: false });
				}

				// Check if token is recent (within 7 days)
				const tokenTime = Number.parseInt(timestamp, 10);
				const now = Date.now();
				const sevenDays = 7 * 24 * 60 * 60 * 1000;

				if (now - tokenTime > sevenDays) {
					return NextResponse.json({ isAuthenticated: false });
				}

				return NextResponse.json({ isAuthenticated: true });
			} catch (error) {
				return NextResponse.json({ isAuthenticated: false });
			}
		}

		return NextResponse.json({ isAuthenticated: false });
	} catch (error) {
		console.error("Auth status check error:", error);
		return NextResponse.json({ isAuthenticated: false });
	}
}
