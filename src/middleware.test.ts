// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { signSessionCookie } from "~/lib/session-cookie";
import { middleware } from "./middleware";

const { SECRET } = vi.hoisted(() => ({
	SECRET: "test-secret-at-least-16-chars",
}));

vi.mock("~/env", () => ({ env: { SESSION_SECRET: SECRET } }));

function req(path: string, cookie?: string): NextRequest {
	return new NextRequest(`http://localhost:1333${path}`, {
		headers: cookie ? { cookie: `session=${cookie}` } : {},
	});
}

const forged = Buffer.from(`matt:${Date.now()}`).toString("base64url");

describe("middleware", () => {
	it("redirects an unauthenticated page request to /login?next=", async () => {
		const res = await middleware(req("/albums"));
		expect(res.status).toBe(307);
		expect(res.headers.get("location")).toBe(
			"http://localhost:1333/login?next=%2Falbums",
		);
	});

	it("rejects a forged unsigned cookie on a previously gated page", async () => {
		const res = await middleware(req("/books", forged));
		expect(res.status).toBe(307);
	});

	it("returns 401 JSON for an unauthenticated API request", async () => {
		const res = await middleware(req("/api/spotify/categorize", forged));
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "Unauthorized" });
	});

	it("lets a validly signed cookie through", async () => {
		const token = await signSessionCookie("matt", SECRET);
		const res = await middleware(req("/albums", token));
		expect(res.headers.get("x-middleware-next")).toBe("1");
	});

	it("lets public and self-authenticating paths through without a cookie", async () => {
		for (const path of [
			"/login",
			"/public/robs-top-50",
			"/api/auth",
			"/api/cron/sync-folio",
			"/api/rate-your-music/scrape",
		]) {
			const res = await middleware(req(path));
			expect(res.headers.get("x-middleware-next")).toBe("1");
		}
	});
});
