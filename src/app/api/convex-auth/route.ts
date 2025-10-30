import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "~/env";

export async function POST(request: NextRequest) {
	try {
		const cookieStore = await cookies();
		const session = cookieStore.get("session")?.value;

		if (!session) {
			return NextResponse.json({ isAuthenticated: false }, { status: 401 });
		}

		// Decode and validate the session token
		try {
			const decoded = Buffer.from(session, "base64url").toString();
			const parts = decoded.split(":");
			const username = parts[0];
			const timestamp = parts[1];

			if (!username || !timestamp) {
				return NextResponse.json({ isAuthenticated: false }, { status: 401 });
			}

			// Check if token is recent (within 7 days)
			const tokenTime = Number.parseInt(timestamp, 10);
			const now = Date.now();
			const sevenDays = 7 * 24 * 60 * 60 * 1000;

			if (now - tokenTime > sevenDays) {
				return NextResponse.json({ isAuthenticated: false }, { status: 401 });
			}

			// Verify username/password match (basic validation)
			if (username !== env.AUTH_USERNAME) {
				return NextResponse.json({ isAuthenticated: false }, { status: 401 });
			}

			return NextResponse.json({
				isAuthenticated: true,
				user: {
					id: username,
					name: username,
				},
			});
		} catch (error) {
			return NextResponse.json({ isAuthenticated: false }, { status: 401 });
		}
	} catch (error) {
		console.error("Auth validation error:", error);
		return NextResponse.json({ isAuthenticated: false }, { status: 500 });
	}
}
