import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { env } from "~/env";
import { isPublicPath } from "~/lib/route-access";
import { verifySessionCookie } from "~/lib/session-cookie";

// Default-deny: every request needs a validly signed session cookie unless the
// path is in the allowlist in `~/lib/route-access`.
export async function middleware(request: NextRequest) {
	const { pathname, search } = request.nextUrl;

	if (isPublicPath(pathname)) {
		return NextResponse.next();
	}

	const session = await verifySessionCookie(
		request.cookies.get("session")?.value,
		env.SESSION_SECRET,
	);
	if (session) {
		return NextResponse.next();
	}

	if (pathname.startsWith("/api/")) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const url = request.nextUrl.clone();
	url.pathname = "/login";
	url.search = "";
	url.searchParams.set("next", `${pathname}${search}`);
	return NextResponse.redirect(url);
}

export const config = {
	// Run on everything except build assets; the allowlist handles the rest.
	matcher: ["/((?!_next/static|_next/image).*)"],
};
