import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { env } from "~/env";
import {
	addTracksToPlaylist,
	getAlbum,
	getArtistAlbums,
	refreshAccessToken,
	trackToUri,
} from "~/lib/spotify";

type CheckNewTracksRequest = {
	yearId: string;
	accessToken: string;
	days?: number;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
	try {
		const body = (await request.json()) as CheckNewTracksRequest;
		const { yearId, accessToken, days = 30 } = body;

		if (!yearId || !accessToken) {
			return NextResponse.json(
				{ error: "Missing required fields: yearId, accessToken" },
				{ status: 400 },
			);
		}

		console.log(`🎪 Starting manual check for new tracks (last ${days} days)...`);

		const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);

		// Get the year
		const year = await convex.query(api.rooleases.getYearById, {
			yearId: yearId as Id<"rooYears">,
		});

		if (!year) {
			return NextResponse.json({ error: "Year not found" }, { status: 404 });
		}

		console.log(`📅 Processing year ${year.year} → ${year.targetPlaylistName}`);

		// Get artists for this year
		const artists = await convex.query(api.rooleases.getArtistsForYear, {
			yearId: yearId as Id<"rooYears">,
		});

		if (artists.length === 0) {
			return NextResponse.json({
				success: true,
				message: "No artists configured",
				stats: { artistsChecked: 0, tracksAdded: 0 },
			});
		}

		console.log(`🎤 Checking ${artists.length} artists for new releases...`);

		// Calculate the cutoff date
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - days);
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
						console.error(`Error fetching album ${albumSummary.id}:`, albumError);
						stats.errors++;
					}
				}

				// Small delay to avoid rate limiting
				await new Promise((resolve) => setTimeout(resolve, 100));
			} catch (artistError) {
				console.error(`Error checking artist ${rooArtist.artist?.name}:`, artistError);
				stats.errors++;
			}
		}

		console.log(`🎵 Found ${newTracks.length} new tracks to add`);

		// Sort by release date (oldest first)
		newTracks.sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));

		// Add tracks to playlist and record in DB
		if (newTracks.length > 0) {
			const trackUris = newTracks.map((t) => trackToUri(t.trackId));

			for (let i = 0; i < trackUris.length; i += 100) {
				const batch = trackUris.slice(i, i + 100);
				await addTracksToPlaylist(accessToken, year.targetPlaylistId, batch);
			}

			for (const track of newTracks) {
				await convex.mutation(api.rooleases.addTrackToYear, {
					yearId: yearId as Id<"rooYears">,
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
			yearId: yearId as Id<"rooYears">,
		});

		console.log("✅ Check completed:", stats);

		return NextResponse.json({
			success: true,
			stats,
			newTracks: newTracks.map((t) => ({
				name: t.trackName,
				artist: t.artistName,
				album: t.albumName,
			})),
		});
	} catch (error) {
		console.error("❌ Check failed:", error);
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Unknown error" },
			{ status: 500 },
		);
	}
}
