"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";
import { useAuthToken } from "./use-auth-token";

// The browser only ever sees the non-secret parts of the Spotify connection.
// Tokens stay in Convex behind a server-only channel; the short-lived access
// token comes from `POST /api/spotify/refresh-token`, and the refresh token
// never leaves the server.
export type SpotifyConnection = {
	spotifyUserId: string;
	displayName?: string;
};

type UseSpotifyAuthReturn = {
	userId: string | null;
	isLoading: boolean;
	connection: SpotifyConnection | null;
	isConnected: boolean;
	getValidAccessToken: () => Promise<string | null>;
	/** Re-read the connection, e.g. after disconnecting. */
	refreshConnection: () => Promise<void>;
};

type ConnectionStore = { ready: boolean; connection: SpotifyConnection | null };

// Module-level store shared by every `useSpotifyAuth` caller on the page, so
// the session route is hit once per page visit rather than once per component.
const serverSnapshot: ConnectionStore = { ready: false, connection: null };
let snapshot: ConnectionStore = serverSnapshot;
const listeners = new Set<() => void>();

function setSnapshot(next: ConnectionStore): void {
	snapshot = next;
	for (const listener of listeners) listener();
}

async function loadConnection(): Promise<void> {
	let connection: SpotifyConnection | null = null;
	try {
		const res = await fetch("/api/spotify/session");
		if (res.ok) {
			const data = (await res.json()) as {
				isConnected: boolean;
				spotifyUserId: string | null;
				displayName: string | null;
			};
			if (data.isConnected && data.spotifyUserId) {
				connection = {
					spotifyUserId: data.spotifyUserId,
					displayName: data.displayName ?? undefined,
				};
			}
		}
	} catch (error) {
		console.error("Spotify session check failed:", error);
	}
	setSnapshot({ ready: true, connection });
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	// Fetch on the first subscriber; keep any previous result visible meanwhile.
	if (listeners.size === 1) void loadConnection();
	return () => {
		listeners.delete(listener);
	};
}

function getSnapshot(): ConnectionStore {
	return snapshot;
}

function getServerSnapshot(): ConnectionStore {
	return serverSnapshot;
}

export function useSpotifyAuth(): UseSpotifyAuthReturn {
	const { userId, isLoading: authLoading } = useAuthToken();

	// useSyncExternalStore syncs with the session route, which is outside React.
	const { ready, connection } = useSyncExternalStore(
		subscribe,
		getSnapshot,
		getServerSnapshot,
	);

	const isConnected = userId !== null && connection !== null;

	// Token cache to prevent redundant refresh calls
	const tokenCacheRef = useRef<{ token: string; expiresAt: number } | null>(
		null,
	);
	const inFlightRef = useRef<Promise<string | null> | null>(null);

	// Get a valid access token (refreshes if expired, uses cache otherwise)
	const getValidAccessToken = useCallback(async (): Promise<string | null> => {
		if (!userId) {
			return null;
		}

		const now = Date.now();
		const expiryBufferMs = 5 * 60 * 1000;

		if (
			tokenCacheRef.current &&
			tokenCacheRef.current.expiresAt > now + expiryBufferMs
		) {
			return tokenCacheRef.current.token;
		}

		if (inFlightRef.current) {
			return inFlightRef.current;
		}

		const request = (async (): Promise<string | null> => {
			try {
				const res = await fetch("/api/spotify/refresh-token", {
					method: "POST",
				});

				if (!res.ok) {
					const errorBody = (await res.json().catch(() => null)) as {
						error?: string;
					} | null;
					console.error(
						"Failed to get valid Spotify token:",
						errorBody?.error ?? res.status,
					);
					return null;
				}

				const data = (await res.json()) as {
					accessToken: string;
					expiresIn?: number;
				};

				const expiresIn = data.expiresIn ?? 3600;
				tokenCacheRef.current = {
					token: data.accessToken,
					expiresAt: Date.now() + expiresIn * 1000,
				};

				return data.accessToken;
			} catch (error) {
				console.error("Token refresh error:", error);
				return null;
			} finally {
				inFlightRef.current = null;
			}
		})();
		inFlightRef.current = request;
		return request;
	}, [userId]);

	return {
		userId,
		isLoading: authLoading || (userId !== null && !ready),
		connection: userId !== null ? connection : null,
		isConnected,
		getValidAccessToken,
		refreshConnection: loadConnection,
	};
}
