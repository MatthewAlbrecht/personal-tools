import { ConvexHttpClient } from "convex/browser";
import type { NextApiRequest, NextApiResponse } from "next";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { env } from "~/env";
import {
	addTracksToPlaylist,
	getAlbum,
	getArtistAlbums,
	refreshAccessToken,
	trackToUri,
} from "~/lib/spotify";

type CronResponse = {
	success?: boolean;
	error?: string;
	message?: string;
	stats?: {
		artistsChecked: number;
		albumsFound: number;
		tracksFound: number;
		tracksAdded: number;
		tracksSkipped: number;
		errors: number;
	};
	timestamp?: string;
};

function normalizeReleaseDate(
	releaseDate: string,
	precision: "day" | "month" | "year",
): string {
	if (precision === "month") {
		return `${releaseDate}-01`;
	}
	if (precision === "year") {
		return `${releaseDate}-01-01`;
	}
	return releaseDate;
}

function getQueryParam(
	value: string | string[] | undefined,
): string | undefined {
	if (!value) return undefined;
	if (Array.isArray(value)) return value[0];
	return value;
}

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse<CronResponse>,
) {
	// Only allow GET or POST (QStash defaults to GET)
	if (req.method !== "GET" && req.method !== "POST") {
		return res.status(405).json({ error: "Method not allowed" });
	}

	// Verify this is a legitimate cron request
	const authHeader = req.headers.authorization;
	const expectedAuth = `Bearer ${env.CRON_SECRET}`;

	if (!authHeader || authHeader !== expectedAuth) {
		return res.status(401).json({ error: "Unauthorized" });
	}

	const queryYearId = getQueryParam(req.query.yearId);
	const queryDays = getQueryParam(req.query.days);
	const queryUserId = getQueryParam(req.query.user);

	const body =
		req.method === "POST" && req.body && typeof req.body === "object"
			? (req.body as { yearId?: string; days?: number; userId?: string })
			: null;

	const days =
		typeof body?.days === "number"
			? body.days
			: queryDays
				? Number(queryDays)
				: 30;

	const userId =
		(body?.userId?.trim() ||
			(queryUserId ? queryUserId.trim() : "") ||
			env.SPOTIFY_SYNC_USER_ID) ?? "";

	if (!userId) {
		return res.status(400).json({ error: "Missing Spotify user id" });
	}

	try {
		const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);

		// Resolve year
		const yearId = body?.yearId ?? queryYearId;
		const year = yearId
			? await convex.query(api.rooleases.getYearById, {
					yearId: yearId as Id<"rooYears">,
				})
			: await convex.query(api.rooleases.getDefaultYear, {});

		if (!year) {
			return res.status(404).json({ error: "Year not found" });
		}

		// Get connection for token refresh
		const connection = await convex.query(api.spotify.getConnection, {
			userId,
		});

		if (!connection) {
			return res.status(404).json({ error: "No Spotify connection found" });
		}

		let accessToken = connection.accessToken;
		const now = Date.now();
		const isExpired = connection.expiresAt < now + 5 * 60 * 1000;

		if (isExpired) {
			const newTokens = await refreshAccessToken(connection.refreshToken);
			await convex.mutation(api.spotify.updateTokens, {
				userId,
				accessToken: newTokens.access_token,
				expiresIn: newTokens.expires_in,
				refreshToken: newTokens.refresh_token,
			});
			accessToken = newTokens.access_token;
		}

		// Get artists for this year
		const artists = await convex.query(api.rooleases.getArtistsForYear, {
			yearId: year._id,
		});

		if (artists.length === 0) {
			return res.status(200).json({
				success: true,
				message: "No artists configured",
				stats: {
					artistsChecked: 0,
					albumsFound: 0,
					tracksFound: 0,
					tracksAdded: 0,
					tracksSkipped: 0,
					errors: 0,
				},
				timestamp: new Date().toISOString(),
			});
		}

		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - days);
		const cutoffDateStr = cutoffDate.toISOString().split("T")[0] ?? "";

		const stats = {
			artistsChecked: 0,
			albumsFound: 0,
			tracksFound: 0,
			tracksAdded: 0,
			tracksSkipped: 0,
			errors: 0,
		};

		const newTracks: Array<{
			trackId: string;
			trackName: string;
			artistName: string;
			albumName: string;
			releaseDate: string;
			releaseDateSort: number;
			artistId: string;
		}> = [];

		for (const rooArtist of artists) {
			if (!rooArtist.artist) continue;

			try {
				stats.artistsChecked++;
				const albums = await getArtistAlbums(
					accessToken,
					rooArtist.spotifyArtistId,
					["album", "single"],
					10,
				);

				const recentAlbums = albums.filter((album) => {
					const releaseDate = album.release_date;
					if (album.release_date_precision === "day") {
						return releaseDate >= cutoffDateStr;
					}
					if (album.release_date_precision === "month") {
						return releaseDate >= cutoffDateStr.substring(0, 7);
					}
					return releaseDate >= cutoffDateStr.substring(0, 4);
				});

				stats.albumsFound += recentAlbums.length;

				for (const albumSummary of recentAlbums) {
					try {
						const album = await getAlbum(accessToken, albumSummary.id);
						const normalizedReleaseDate = normalizeReleaseDate(
							album.release_date,
							album.release_date_precision,
						);
						const releaseDateSort = Date.parse(normalizedReleaseDate);

						for (const track of album.tracks.items) {
							const isAdded = await convex.query(api.rooleases.isTrackAdded, {
								spotifyTrackId: track.id,
							});

							if (isAdded) {
								stats.tracksSkipped++;
								continue;
							}

							stats.tracksFound++;
							newTracks.push({
								trackId: track.id,
								trackName: track.name,
								artistName: rooArtist.artist.name,
								albumName: album.name,
								releaseDate: album.release_date,
								releaseDateSort,
								artistId: rooArtist.spotifyArtistId,
							});
						}
					} catch (albumError) {
						console.error(`Error fetching album ${albumSummary.id}:`, albumError);
						stats.errors++;
					}
				}

				await new Promise((resolve) => setTimeout(resolve, 100));
			} catch (artistError) {
				console.error(`Error checking artist ${rooArtist.artist?.name}:`, artistError);
				stats.errors++;
			}
		}

		newTracks.sort((a, b) => {
			if (a.releaseDateSort !== b.releaseDateSort) {
				return a.releaseDateSort - b.releaseDateSort;
			}
			const artistCompare = a.artistName.localeCompare(b.artistName);
			if (artistCompare !== 0) return artistCompare;
			return a.trackName.localeCompare(b.trackName);
		});

		if (newTracks.length > 0) {
			const trackUris = newTracks.map((t) => trackToUri(t.trackId));
			for (let i = 0; i < trackUris.length; i += 100) {
				const batch = trackUris.slice(i, i + 100);
				await addTracksToPlaylist(accessToken, year.targetPlaylistId, batch);
			}

			for (const track of newTracks) {
				await convex.mutation(api.rooleases.addTrackToYear, {
					yearId: year._id,
					spotifyTrackId: track.trackId,
					spotifyArtistId: track.artistId,
					trackName: track.trackName,
					albumName: track.albumName,
					releaseDate: track.releaseDate,
				});
				stats.tracksAdded++;
			}
		}

		await convex.mutation(api.rooleases.updateYearLastChecked, {
			yearId: year._id,
		});

		return res.status(200).json({
			success: true,
			stats,
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		console.error("❌ Cron check failed:", error);
		return res.status(500).json({
			error: "Check failed",
			message: error instanceof Error ? error.message : "Unknown error",
			timestamp: new Date().toISOString(),
		});
	}
}
