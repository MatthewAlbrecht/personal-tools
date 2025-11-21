import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
	// Allow all /public/* routes without auth
	if (request.nextUrl.pathname.startsWith("/public")) {
		return NextResponse.next();
	}

	const session = request.cookies.get("session")?.value;

	// Protect /books, /folio-society, and /articles routes and their API calls
	const isBooks = request.nextUrl.pathname.startsWith("/books");
	const isFolioSociety = request.nextUrl.pathname.startsWith("/folio-society");
	const isArticles = request.nextUrl.pathname.startsWith("/articles");

	if ((isBooks || isFolioSociety || isArticles) && !session) {
		const url = request.nextUrl.clone();
		url.pathname = "/login";
		url.searchParams.set("next", request.nextUrl.pathname);
		return NextResponse.redirect(url);
	}
	return NextResponse.next();
}

export const config = {
	matcher: [
		"/books",
		"/books/:path*",
		"/folio-society",
		"/folio-society/:path*",
		"/articles",
		"/articles/:path*",
	],
};
