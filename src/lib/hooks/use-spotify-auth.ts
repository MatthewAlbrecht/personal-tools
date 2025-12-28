"use client";

import { useQuery } from "convex/react";
import { useCallback, useRef } from "react";
import { api } from "../../../convex/_generated/api";
import { useAuthToken } from "./use-auth-token";

export type SpotifyConnection = {
	_id: string;
	userId: string;
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
	spotifyUserId: string;
	displayName?: string;
	createdAt: number;
	updatedAt: number;
};

type UseSpotifyAuthReturn = {
	userId: string | null;
	isLoading: boolean;
	connection: SpotifyConnection | null;
	isConnected: boolean;
	getValidAccessToken: () => Promise<string | null>;
};

export function useSpotifyAuth(): UseSpotifyAuthReturn {
	const { userId, isLoading: authLoading } = useAuthToken();

	// Query Spotify connection from Convex
	const connection = useQuery(
		api.spotify.getConnection,
		userId ? { userId } : "skip",
	) as SpotifyConnection | null | undefined;

	const isConnected = !!connection;

	// Token cache to prevent redundant refresh calls
	const tokenCacheRef = useRef<{ token: string; expiresAt: number } | null>(
		null,
	);

	// Get a valid access token (refreshes if expired, uses cache otherwise)
	const getValidAccessToken = useCallback(async (): Promise<string | null> => {
		if (!userId) return null;

		// Check cache - use 5 minute buffer before expiry
		const now = Date.now();
		if (
			tokenCacheRef.current &&
			tokenCacheRef.current.expiresAt > now + 5 * 60 * 1000
		) {
			return tokenCacheRef.current.token;
		}

		try {
			const res = await fetch("/api/spotify/refresh-token", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ userId }),
			});

			if (!res.ok) {
				console.error("Failed to get valid token");
				return null;
			}

			const data = await res.json();

			// Cache the token (assume 1 hour expiry if not provided)
			const expiresIn = data.expiresIn ?? 3600;
			tokenCacheRef.current = {
				token: data.accessToken,
				expiresAt: now + expiresIn * 1000,
			};

			return data.accessToken;
		} catch (error) {
			console.error("Token refresh error:", error);
			return null;
		}
	}, [userId]);

	return {
		userId,
		isLoading: authLoading || connection === undefined,
		connection: connection ?? null,
		isConnected,
		getValidAccessToken,
	};
}
