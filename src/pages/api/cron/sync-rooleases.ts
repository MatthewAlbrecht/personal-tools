import { ConvexHttpClient } from "convex/browser";
import type { NextApiRequest, NextApiResponse } from "next";
import { api } from "../../../../convex/_generated/api";
import { env } from "~/env";
import {
	addTracksToPlaylist,
	getAlbum,
	getArtistAlbums,
	refreshAccessToken,
	trackToUri,
} from "~/lib/spotify";

// How many days back to consider a release as "new"
const NEW_RELEASE_DAYS = 30;

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	// Only allow GET/POST requests
	if (req.method !== "GET" && req.method !== "POST") {
		return res.status(405).json({ error: "Method not allowed" });
	}

	// Verify this is a legitimate cron request
	const authHeader = req.headers.authorization;
	const expectedAuth = `Bearer ${env.CRON_SECRET}`;

	if (!authHeader || authHeader !== expectedAuth) {
		return res.status(401).json({ error: "Unauthorized" });
	}

	const userId = env.SPOTIFY_SYNC_USER_ID;

	try {
		console.log("🎪 Starting Rooleases sync...");

		const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);

		// Get default year
		const defaultYear = await convex.query(api.rooleases.getDefaultYear, {});

		if (!defaultYear) {
			console.log("ℹ️ No default year configured, skipping");
			return res.status(200).json({
				success: true,
				message: "No default year configured",
				timestamp: new Date().toISOString(),
			});
		}

		console.log(
			`📅 Processing year ${defaultYear.year} → ${defaultYear.targetPlaylistName}`,
		);

		// Get artists for this year
		const artists = await convex.query(api.rooleases.getArtistsForYear, {
			yearId: defaultYear._id,
		});

		if (artists.length === 0) {
			console.log("ℹ️ No artists configured for this year");
			return res.status(200).json({
				success: true,
				message: "No artists configured",
				timestamp: new Date().toISOString(),
			});
		}

		console.log(`🎤 Checking ${artists.length} artists for new releases...`);

		// Get Spotify connection
		const connection = await convex.query(api.spotify.getConnection, {
			userId,
		});

		if (!connection) {
			console.error("❌ No Spotify connection found");
			return res.status(404).json({ error: "No Spotify connection found" });
		}

		// Refresh token if needed
		let accessToken = connection.accessToken;
		const now = Date.now();
		const isExpired = connection.expiresAt < now + 5 * 60 * 1000;

		if (isExpired) {
			console.log("🔑 Refreshing Spotify access token...");
			const newTokens = await refreshAccessToken(connection.refreshToken);

			await convex.mutation(api.spotify.updateTokens, {
				userId,
				accessToken: newTokens.access_token,
				expiresIn: newTokens.expires_in,
				refreshToken: newTokens.refresh_token,
			});

			accessToken = newTokens.access_token;
		}

		// Calculate the cutoff date for "new" releases
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - NEW_RELEASE_DAYS);
		const cutoffDateStr = cutoffDate.toISOString().split("T")[0] ?? "";

		console.log(`📆 Looking for releases after ${cutoffDateStr}`);

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
			artistId: string;
		}> = [];

		// Check each artist for new releases
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

				// Filter to recent releases
				const recentAlbums = albums.filter((album) => {
					// Handle different precision levels
					const releaseDate = album.release_date;
					if (album.release_date_precision === "day") {
						return releaseDate >= cutoffDateStr;
					}
					if (album.release_date_precision === "month") {
						// Compare year-month
						return releaseDate >= cutoffDateStr.substring(0, 7);
					}
					// Year precision - compare year
					return releaseDate >= cutoffDateStr.substring(0, 4);
				});

				stats.albumsFound += recentAlbums.length;

				// Get tracks from each recent album
				for (const albumSummary of recentAlbums) {
					try {
						const album = await getAlbum(accessToken, albumSummary.id);

						for (const track of album.tracks.items) {
							// Check if already added
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
								artistId: rooArtist.spotifyArtistId,
							});
						}
					} catch (albumError) {
						console.error(
							`Error fetching album ${albumSummary.id}:`,
							albumError,
						);
						stats.errors++;
					}
				}

				// Small delay to avoid rate limiting
				await new Promise((resolve) => setTimeout(resolve, 100));
			} catch (artistError) {
				console.error(
					`Error checking artist ${rooArtist.artist?.name}:`,
					artistError,
				);
				stats.errors++;
			}
		}

		console.log(`🎵 Found ${newTracks.length} new tracks to add`);

		// Sort by release date (oldest first)
		newTracks.sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));

		// Add tracks to playlist and record in DB
		if (newTracks.length > 0) {
			// Add to Spotify playlist in batches of 100
			const trackUris = newTracks.map((t) => trackToUri(t.trackId));

			for (let i = 0; i < trackUris.length; i += 100) {
				const batch = trackUris.slice(i, i + 100);
				await addTracksToPlaylist(
					accessToken,
					defaultYear.targetPlaylistId,
					batch,
				);
			}

			// Record each track in Convex
			for (const track of newTracks) {
				await convex.mutation(api.rooleases.addTrackToYear, {
					yearId: defaultYear._id,
					spotifyTrackId: track.trackId,
					spotifyArtistId: track.artistId,
					trackName: track.trackName,
					albumName: track.albumName,
					releaseDate: track.releaseDate,
				});
				stats.tracksAdded++;
			}
		}

		// Update last checked timestamp
		await convex.mutation(api.rooleases.updateYearLastChecked, {
			yearId: defaultYear._id,
		});

		console.log("✅ Rooleases sync completed:", stats);

		res.status(200).json({
			success: true,
			stats,
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		console.error("❌ Rooleases sync failed:", error);

		res.status(500).json({
			error: "Sync failed",
			message: error instanceof Error ? error.message : "Unknown error",
			timestamp: new Date().toISOString(),
		});
	}
}
