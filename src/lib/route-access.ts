// Default-deny route policy for the middleware. Everything not listed here
// requires a valid signed session cookie. Pure, relative imports only.

// Exact paths that authenticate themselves (bearer secret, token) or serve the
// login flow. Anything else under /api is gated by the session cookie.
const PUBLIC_EXACT = new Set([
	"/login",
	"/api/auth", // login/logout
	"/api/auth/status", // returns { isAuthenticated: false } to anonymous callers
	// Static images/icons in public/
	"/favicon.ico",
	"/favicon.svg",
	"/sonemic-512.png",
	// Vercel cron: each handler checks `Authorization: Bearer CRON_SECRET` (src/pages/api/cron)
	"/api/cron/rooleases-check",
	"/api/cron/send-birthday-reminders",
	"/api/cron/sync-folio",
	"/api/cron/sync-for-later-albums",
	"/api/cron/sync-music-funnel",
	"/api/cron/sync-rooleases",
	"/api/cron/sync-smart-playlists",
	"/api/cron/sync-spotify",
	// AI enrichment HTTP API: unauthorizedIfNotEnrichmentSecret (Bearer ALBUM_ENRICHMENT_SECRET)
	"/api/album-enrichment/claim",
	"/api/album-enrichment/promote-trial",
	"/api/album-enrichment/resolve",
	"/api/album-enrichment/save",
	"/api/album-enrichment/trial",
	// Chrome extension: Bearer RYM_EXTENSION_INGEST_SECRET
	"/api/rate-your-music/scrape",
	"/api/rate-your-music/covers",
	"/api/bandcamp/capture",
	"/api/yugioh/ebay-capture",
	"/api/yugioh/tcgplayer-capture",
	// Also the automated-run script (scripts/yugioh-automation/run.sh)
	"/api/yugioh/automation",
	// Launch page (static public/launch.html): it loads these modules and /api/launch-config from the same origin
	"/launch.html",
	"/launch-dnd.mjs",
	"/launch-model.mjs",
	"/api/launch-config",
	// Calendar subscription feed: validated by `?token=` against Convex (no cookie from calendar apps)
	"/api/concerts/ical",
]);

// Path prefixes (segment-bounded) that are public.
const PUBLIC_PREFIXES = [
	"/public", // intentionally public pages
	"/_next", // Next.js build assets and image optimizer
	"/zine", // public/zine images
];

export function isPublicPath(pathname: string): boolean {
	const path =
		pathname.length > 1 && pathname.endsWith("/")
			? pathname.slice(0, -1)
			: pathname;
	if (PUBLIC_EXACT.has(path)) return true;
	return PUBLIC_PREFIXES.some(
		(prefix) => path === prefix || path.startsWith(`${prefix}/`),
	);
}

/** Only same-origin relative paths are allowed as post-login redirects. */
export function safeNextPath(next: string | null | undefined): string {
	if (!next || !next.startsWith("/")) return "/";
	if (next.startsWith("//") || next.includes("\\")) return "/";
	// biome-ignore lint/suspicious/noControlCharactersInRegex: reject control chars in redirect targets
	if (/[\u0000-\u001f\u007f]/.test(next)) return "/";
	return next;
}
