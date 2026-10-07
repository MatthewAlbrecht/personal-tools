// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("~/env", () => ({
	env: {
		NEXT_PUBLIC_CONVEX_URL: "https://happy-otter-123.convex.cloud",
		CONVEX_SERVER_SECRET: "server-secret-0123456789",
	},
}));

import {
	getSpotifyConnection,
	toConvexSiteUrl,
	updateSpotifyTokens,
} from "./convex-server";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("toConvexSiteUrl", () => {
	it("maps the cloud origin to the site origin", () => {
		expect(toConvexSiteUrl("https://happy-otter-123.convex.cloud")).toBe(
			"https://happy-otter-123.convex.site",
		);
	});

	it("refuses origins it cannot map", () => {
		expect(() => toConvexSiteUrl("https://example.com")).toThrow();
	});
});

describe("server channel requests", () => {
	it("posts to the site origin with the bearer secret", async () => {
		const fetchMock = vi.fn(async () => Response.json(null));
		vi.stubGlobal("fetch", fetchMock);

		await getSpotifyConnection("moose");

		const [url, init] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(url).toBe(
			"https://happy-otter-123.convex.site/server/spotify/get-connection",
		);
		expect(init.method).toBe("POST");
		expect((init.headers as Record<string, string>).Authorization).toBe(
			"Bearer server-secret-0123456789",
		);
		expect(JSON.parse(init.body as string)).toEqual({ userId: "moose" });
	});

	it("throws when the channel rejects the call", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("nope", { status: 401 })),
		);
		await expect(
			updateSpotifyTokens({ userId: "moose", accessToken: "a", expiresIn: 1 }),
		).rejects.toThrow(/401/);
	});
});
