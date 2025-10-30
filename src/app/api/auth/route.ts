import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "~/env";

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

	if (username === env.AUTH_USERNAME && password === env.AUTH_PASSWORD) {
		const token = Buffer.from(`${username}:${Date.now()}`).toString(
			"base64url",
		);
		const cookieStore = await cookies();
		cookieStore.set("session", token, {
			httpOnly: true,
			sameSite: "lax",
			path: "/",
			secure: env.NODE_ENV === "production",
			maxAge: 60 * 60 * 24 * 7, // 7 days
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
