import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// Raw sources, used to prove nothing still reaches the locked-down functions
// through the public `api` object.
const convexSources = import.meta.glob(
	["./**/*.ts", "!./_generated/**", "!./**/*.test.ts"],
	{ query: "?raw", import: "default", eager: true },
) as Record<string, string>;
const srcSources = import.meta.glob(
	["../src/**/*.{ts,tsx}", "!../src/**/*.test.{ts,tsx}"],
	{ query: "?raw", import: "default", eager: true },
) as Record<string, string>;

type Registered = { isPublic?: boolean; isInternal?: boolean } | undefined;

async function load(
	modulePath: string,
	exportName: string,
): Promise<Registered> {
	const loader = modules[modulePath];
	if (!loader) throw new Error(`Missing module ${modulePath}`);
	const mod = (await loader()) as Record<string, Registered>;
	return mod[exportName];
}

// Spotify OAuth token functions: anyone with the Convex URL could read or
// overwrite these while they were public (audit E1).
const tokenFunctions = [
	"getConnection",
	"updateTokens",
	"upsertConnection",
	"deleteConnection",
] as const;

// One-off migrations / backfills that rewrite or delete data.
const oneOffFunctions: Array<[string, string]> = [
	["./migrations/initializeRatingHistory.ts", "clearRatingHistory"],
	["./migrations/backfillCategorizedAt.ts", "run"],
	["./migrations/backfillListenFilterFields.ts", "runBatch"],
	["./migrations/backfillSpotifyAlbumId.ts", "run"],
	["./migrations/backfillSpotifyAlbumsSource.ts", "run"],
	["./migrations/backfillSpotifyAlbumsSource.ts", "runBatch"],
	["./migrations/backfillUserTracks.ts", "getStats"],
	["./migrations/backfillUserTracks.ts", "processBatch"],
	["./migrations/backfillUserTracks.ts", "runBatch"],
	["./migrations/backfillUserTracks.ts", "run"],
	["./launch.ts", "backfillLayoutOrdering"],
	["./launch.ts", "verifyLayoutOrdering"],
];

describe("token and one-off functions are not publicly callable", () => {
	test.each(tokenFunctions)("spotify.%s is internal", async (name) => {
		const fn = await load("./spotify.ts", name);
		expect(fn, `expected spotify.${name} to exist`).toBeDefined();
		expect(fn?.isPublic).not.toBe(true);
		expect(fn?.isInternal).toBe(true);
	});

	test("spotify.getAllConnections (dumps every token row) no longer exists", async () => {
		expect(await load("./spotify.ts", "getAllConnections")).toBeUndefined();
	});

	test.each(oneOffFunctions)("%s %s is internal", async (modulePath, name) => {
		const fn = await load(modulePath, name);
		expect(fn, `expected ${modulePath} ${name} to exist`).toBeDefined();
		expect(fn?.isPublic).not.toBe(true);
		expect(fn?.isInternal).toBe(true);
	});
});

describe("nothing reaches the locked-down functions through the public api", () => {
	const publicRefs =
		/\bapi\.spotify\.(getConnection|getAllConnections|updateTokens|upsertConnection|deleteConnection)\b|\bapi\.launch\.(backfillLayoutOrdering|verifyLayoutOrdering)\b|\bapi\.migrations[./]/;

	test("no convex module references them via api.*", () => {
		const offenders = Object.entries(convexSources)
			.filter(([, source]) => publicRefs.test(source))
			.map(([file]) => file);
		expect(offenders).toEqual([]);
	});

	test("no src file references them via api.*", () => {
		const offenders = Object.entries(srcSources)
			.filter(([, source]) => publicRefs.test(source))
			.map(([file]) => file);
		expect(offenders).toEqual([]);
	});
});

describe("the browser never receives Spotify tokens from Convex", () => {
	test("useSpotifyAuth does not subscribe to Convex for the connection", () => {
		const source = srcSources["../src/lib/hooks/use-spotify-auth.ts"];
		expect(source).toBeDefined();
		expect(source).not.toMatch(/convex\/react/);
		expect(source).not.toMatch(/api\.spotify/);
		expect(source).not.toMatch(/refreshToken/);
	});

	test("the session route exists and never touches the refresh token", () => {
		const source = srcSources["../src/app/api/spotify/session/route.ts"];
		expect(source, "expected GET /api/spotify/session").toBeDefined();
		expect(source).not.toMatch(/refreshToken/);
		expect(source).not.toMatch(/accessToken/);
	});
});

describe("server-only HTTP channel for Spotify tokens", () => {
	const secret = "test-server-secret-0123456789";
	const connection = {
		userId: "moose",
		accessToken: "access-1",
		refreshToken: "refresh-1",
		expiresAt: 1_000_000,
		spotifyUserId: "spotify-moose",
		displayName: "Moose",
		createdAt: 1,
		updatedAt: 1,
	};

	beforeEach(() => {
		vi.stubEnv("CONVEX_SERVER_SECRET", secret);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	function post(
		t: ReturnType<typeof convexTest>,
		path: string,
		body: unknown,
		headers: Record<string, string> = { authorization: `Bearer ${secret}` },
	) {
		return t.fetch(path, {
			method: "POST",
			headers: { "content-type": "application/json", ...headers },
			body: JSON.stringify(body),
		});
	}

	async function seeded() {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			await ctx.db.insert("spotifyConnections", connection);
		});
		return t;
	}

	test("rejects a request with no bearer header", async () => {
		const t = await seeded();
		const res = await post(
			t,
			"/server/spotify/get-connection",
			{ userId: "moose" },
			{},
		);
		expect(res.status).toBe(401);
		expect(await res.text()).not.toContain("refresh-1");
	});

	test("rejects a wrong secret", async () => {
		const t = await seeded();
		const res = await post(
			t,
			"/server/spotify/get-connection",
			{ userId: "moose" },
			{ authorization: "Bearer not-the-secret-not-the-secret" },
		);
		expect(res.status).toBe(401);
	});

	test("fails closed when the deployment secret is unset or too short", async () => {
		const t = await seeded();
		vi.stubEnv("CONVEX_SERVER_SECRET", "");
		const unset = await post(t, "/server/spotify/get-connection", {
			userId: "moose",
		});
		expect(unset.status).toBe(503);
		vi.stubEnv("CONVEX_SERVER_SECRET", "short");
		const short = await post(
			t,
			"/server/spotify/get-connection",
			{ userId: "moose" },
			{ authorization: "Bearer short" },
		);
		expect(short.status).toBe(503);
	});

	test("get-connection returns the stored row for a valid secret", async () => {
		const t = await seeded();
		const res = await post(t, "/server/spotify/get-connection", {
			userId: "moose",
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as typeof connection;
		expect(body.accessToken).toBe("access-1");
		expect(body.refreshToken).toBe("refresh-1");
	});

	test("get-connection returns null for an unknown user", async () => {
		const t = await seeded();
		const res = await post(t, "/server/spotify/get-connection", {
			userId: "nobody",
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toBeNull();
	});

	test("update-tokens rotates the access token and keeps the refresh token", async () => {
		const t = await seeded();
		const res = await post(t, "/server/spotify/update-tokens", {
			userId: "moose",
			accessToken: "access-2",
			expiresIn: 3600,
		});
		expect(res.status).toBe(200);
		const row = await t.run(async (ctx) =>
			ctx.db
				.query("spotifyConnections")
				.withIndex("by_userId", (q) => q.eq("userId", "moose"))
				.unique(),
		);
		expect(row?.accessToken).toBe("access-2");
		expect(row?.refreshToken).toBe("refresh-1");
	});

	test("upsert-connection creates a connection and delete-connection removes it", async () => {
		const t = convexTest(schema, modules);
		const created = await post(t, "/server/spotify/upsert-connection", {
			userId: "moose",
			accessToken: "a",
			refreshToken: "r",
			expiresIn: 3600,
			spotifyUserId: "sp",
			displayName: "Moose",
		});
		expect(created.status).toBe(200);
		const deleted = await post(t, "/server/spotify/delete-connection", {
			userId: "moose",
		});
		expect(deleted.status).toBe(200);
		const rows = await t.run(async (ctx) =>
			ctx.db.query("spotifyConnections").take(5),
		);
		expect(rows).toEqual([]);
	});

	test("rejects malformed bodies with 400 after auth", async () => {
		const t = await seeded();
		const res = await post(t, "/server/spotify/update-tokens", {
			userId: "moose",
		});
		expect(res.status).toBe(400);
	});

	test("every mutating route requires the secret", async () => {
		const t = await seeded();
		for (const path of [
			"/server/spotify/update-tokens",
			"/server/spotify/upsert-connection",
			"/server/spotify/delete-connection",
		]) {
			const res = await post(t, path, { userId: "moose" }, {});
			expect(res.status, path).toBe(401);
		}
		const rows = await t.run(async (ctx) =>
			ctx.db.query("spotifyConnections").take(5),
		);
		expect(rows).toHaveLength(1);
	});
});
