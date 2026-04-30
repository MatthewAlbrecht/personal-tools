import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
	// Allow all /public/* routes without auth
	if (request.nextUrl.pathname.startsWith("/public")) {
		return NextResponse.next();
	}

	const session = request.cookies.get("session")?.value;

	// Protect private app routes and their API calls
	const isBooks = request.nextUrl.pathname.startsWith("/books");
	const isFolioSociety = request.nextUrl.pathname.startsWith("/folio-society");
	const isArticles = request.nextUrl.pathname.startsWith("/articles");
	const isPlaylistLyrics =
		request.nextUrl.pathname.startsWith("/playlist-lyrics");
	const isPlaylistLyricsApi = request.nextUrl.pathname.startsWith(
		"/api/migrate-playlist-lyrics",
	);

	if (
		(isBooks ||
			isFolioSociety ||
			isArticles ||
			isPlaylistLyrics ||
			isPlaylistLyricsApi) &&
		!session
	) {
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
		"/playlist-lyrics",
		"/playlist-lyrics/:path*",
		"/api/migrate-playlist-lyrics",
	],
};
