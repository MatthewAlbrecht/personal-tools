import { env } from "~/env";
import type { IngestReport } from "../../convex/model/yugioh/listings";
import type { TcgplayerIngestReport } from "../../convex/model/yugioh/tcgplayerCapture";

// Server-only client for the secret-guarded Convex HTTP actions in
// `convex/http.ts`. Spotify token functions are internal in Convex, so Next
// route handlers and crons reach them only through here. Never import this
// from a client component: it reads CONVEX_SERVER_SECRET.

export type SpotifyConnectionRecord = {
	_id: string;
	_creationTime: number;
	userId: string;
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
	spotifyUserId: string;
	displayName?: string;
	createdAt: number;
	updatedAt: number;
};

/** HTTP actions are served from `<deployment>.convex.site`, not `.convex.cloud`. */
export function toConvexSiteUrl(convexCloudUrl: string): string {
	const url = new URL(convexCloudUrl);
	if (!url.hostname.endsWith(".convex.cloud")) {
		throw new Error(`Cannot derive the Convex site URL from ${url.origin}`);
	}
	url.hostname = url.hostname.replace(/\.convex\.cloud$/, ".convex.site");
	return url.origin;
}

async function callConvexServer<T>(path: string, body: unknown): Promise<T> {
	const response = await fetch(
		`${toConvexSiteUrl(env.NEXT_PUBLIC_CONVEX_URL)}${path}`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${env.CONVEX_SERVER_SECRET}`,
			},
			body: JSON.stringify(body),
			cache: "no-store",
		},
	);
	if (!response.ok) {
		throw new Error(`Convex server call ${path} failed (${response.status})`);
	}
	return (await response.json()) as T;
}

export function getSpotifyConnection(
	userId: string,
): Promise<SpotifyConnectionRecord | null> {
	return callConvexServer("/server/spotify/get-connection", { userId });
}

export async function updateSpotifyTokens(args: {
	userId: string;
	accessToken: string;
	expiresIn: number;
	refreshToken?: string;
}): Promise<void> {
	await callConvexServer("/server/spotify/update-tokens", args);
}

export async function upsertSpotifyConnection(args: {
	userId: string;
	accessToken: string;
	refreshToken: string;
	expiresIn: number;
	spotifyUserId: string;
	displayName?: string;
}): Promise<void> {
	await callConvexServer("/server/spotify/upsert-connection", args);
}

export async function deleteSpotifyConnection(userId: string): Promise<void> {
	await callConvexServer("/server/spotify/delete-connection", { userId });
}

/** Stores one captured eBay search-results page (`internal.yugioh.listings`). */
export function captureEbayListings(
	listings: unknown[],
): Promise<IngestReport> {
	return callConvexServer("/server/yugioh/ebay-listings", { listings });
}

/** Stores one captured TCGplayer product page (`internal.yugioh.listings`). */
export function captureTcgplayerProduct(
	product: object,
): Promise<TcgplayerIngestReport> {
	return callConvexServer("/server/yugioh/tcgplayer-product", { product });
}
