// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isPublicPath, safeNextPath } from "./route-access";

describe("isPublicPath", () => {
	const allowed = [
		"/login",
		"/public/robs-top-50",
		"/public/lyrics/some-slug",
		"/api/auth",
		"/api/auth/status",
		"/_next/static/chunks/main.js",
		"/_next/image",
		"/favicon.ico",
		"/favicon.svg",
		"/sonemic-512.png",
		"/zine/denver-record-club-logo.png",
		"/api/cron/sync-folio",
		"/api/cron/send-birthday-reminders",
		"/api/album-enrichment/claim",
		"/api/rate-your-music/scrape",
		"/api/rate-your-music/covers",
		"/api/bandcamp/capture",
		"/api/yugioh/ebay-capture",
		"/api/concerts/ical",
		"/launch.html",
		"/launch-dnd.mjs",
		"/launch-model.mjs",
		"/api/launch-config",
	];

	const denied = [
		"/books",
		"/albums",
		"/for-later-albums",
		"/lyrics",
		"/",
		"/launch-model.test.mjs",
		"/api/convex-auth",
		"/api/trpc/anything",
		"/api/spotify/refresh-token",
		"/api/extract-article",
		"/api/migrate-lyrics",
		"/api/cron/not-a-real-cron",
		"/api/album-enrichment/unknown",
		"/api/authx",
		"/publicity",
		"/public-not",
		"/loginx",
		"/_nextfoo",
		"/api/rate-your-music/other",
	];

	it.each(allowed)("allows %s", (path) => {
		expect(isPublicPath(path)).toBe(true);
	});

	it.each(denied)("denies %s", (path) => {
		expect(isPublicPath(path)).toBe(false);
	});

	it("tolerates a trailing slash on exact entries", () => {
		expect(isPublicPath("/login/")).toBe(true);
		expect(isPublicPath("/api/cron/sync-folio/")).toBe(true);
	});
});

describe("safeNextPath", () => {
	it("keeps same-origin relative paths including query", () => {
		expect(safeNextPath("/albums")).toBe("/albums");
		expect(safeNextPath("/books?tab=1#x")).toBe("/books?tab=1#x");
	});

	it.each([
		null,
		undefined,
		"",
		"albums",
		"//evil.com",
		"/\\evil.com",
		"https://evil.com",
		"javascript:alert(1)",
		"/\nfoo",
	])("falls back to / for %j", (value) => {
		expect(safeNextPath(value as string | null | undefined)).toBe("/");
	});
});
