import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "~/env";
import {
	SESSION_MAX_AGE_SECONDS,
	constantTimeEqual,
	signSessionCookie,
} from "~/lib/session-cookie";

export async function POST(request: Request) {
	const formData = await request.formData();
	const username = String(formData.get("username") ?? "");
	const password = String(formData.get("password") ?? "");
	const intent = String(formData.get("intent") ?? "");

	if (intent === "logout") {
		const cookieStore = await cookies();
		cookieStore.delete("session");
		return NextResponse.json({ ok: true });
	}

	// Evaluate both comparisons (no short-circuit) so timing does not reveal which failed.
	const usernameOk = constantTimeEqual(username, env.AUTH_USERNAME);
	const passwordOk = constantTimeEqual(password, env.AUTH_PASSWORD);
	if (usernameOk && passwordOk) {
		const token = await signSessionCookie(username, env.SESSION_SECRET);
		const cookieStore = await cookies();
		cookieStore.set("session", token, {
			httpOnly: true,
			sameSite: "lax",
			path: "/",
			secure: env.NODE_ENV === "production",
			maxAge: SESSION_MAX_AGE_SECONDS,
		});
		return NextResponse.json({ ok: true });
	}

	return NextResponse.json({ ok: false }, { status: 401 });
}

export async function DELETE() {
	const cookieStore = await cookies();
	cookieStore.delete("session");
	return NextResponse.json({ ok: true });
}
