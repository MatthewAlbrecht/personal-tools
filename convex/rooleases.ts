import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { api } from "./_generated/api";

// ============================================================================
// Artist Management
// ============================================================================

export const upsertArtist = mutation({
	args: {
		spotifyArtistId: v.string(),
		name: v.string(),
		imageUrl: v.optional(v.string()),
		genres: v.optional(v.array(v.string())),
		popularity: v.optional(v.number()),
		rawData: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		const existing = await ctx.db
			.query("spotifyArtists")
			.withIndex("by_spotifyArtistId", (q) =>
				q.eq("spotifyArtistId", args.spotifyArtistId),
			)
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				name: args.name,
				imageUrl: args.imageUrl,
				genres: args.genres,
				popularity: args.popularity,
				rawData: args.rawData,
				updatedAt: now,
			});
			return existing._id;
		}

		return await ctx.db.insert("spotifyArtists", {
			spotifyArtistId: args.spotifyArtistId,
			name: args.name,
			imageUrl: args.imageUrl,
			genres: args.genres,
			popularity: args.popularity,
			rawData: args.rawData,
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const getArtistBySpotifyId = query({
	args: { spotifyArtistId: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("spotifyArtists")
			.withIndex("by_spotifyArtistId", (q) =>
				q.eq("spotifyArtistId", args.spotifyArtistId),
			)
			.first();
	},
});

// Check which artist IDs already exist in the database
export const getExistingArtistIds = query({
	args: { spotifyArtistIds: v.array(v.string()) },
	handler: async (ctx, args) => {
		const existingIds: string[] = [];
		for (const id of args.spotifyArtistIds) {
			const existing = await ctx.db
				.query("spotifyArtists")
				.withIndex("by_spotifyArtistId", (q) => q.eq("spotifyArtistId", id))
				.first();
			if (existing) {
				existingIds.push(id);
			}
		}
		return existingIds;
	},
});

export const searchArtists = query({
	args: { searchTerm: v.string() },
	handler: async (ctx, args) => {
		const allArtists = await ctx.db.query("spotifyArtists").collect();
		const term = args.searchTerm.toLowerCase();

		return allArtists
			.filter((artist) => artist.name.toLowerCase().includes(term))
			.slice(0, 20);
	},
});

// ============================================================================
// Year Management
// ============================================================================

export const createYear = mutation({
	args: {
		year: v.number(),
		targetPlaylistId: v.string(),
		targetPlaylistName: v.string(),
		isDefault: v.boolean(),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		// Check if year already exists
		const existing = await ctx.db
			.query("rooYears")
			.withIndex("by_year", (q) => q.eq("year", args.year))
			.first();

		if (existing) {
			throw new Error(`Year ${args.year} already exists`);
		}

		// If setting as default, unset any existing default
		if (args.isDefault) {
			const currentDefault = await ctx.db
				.query("rooYears")
				.withIndex("by_isDefault", (q) => q.eq("isDefault", true))
				.first();

			if (currentDefault) {
				await ctx.db.patch(currentDefault._id, { isDefault: false });
			}
		}

		return await ctx.db.insert("rooYears", {
			year: args.year,
			targetPlaylistId: args.targetPlaylistId,
			targetPlaylistName: args.targetPlaylistName,
			isDefault: args.isDefault,
			createdAt: now,
		});
	},
});

export const getYears = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db
			.query("rooYears")
			.withIndex("by_year")
			.order("desc")
			.collect();
	},
});

export const getYearById = query({
	args: { yearId: v.id("rooYears") },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.yearId);
	},
});

export const getDefaultYear = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db
			.query("rooYears")
			.withIndex("by_isDefault", (q) => q.eq("isDefault", true))
			.first();
	},
});

export const setDefaultYear = mutation({
	args: { yearId: v.id("rooYears") },
	handler: async (ctx, args) => {
		// Unset current default
		const currentDefault = await ctx.db
			.query("rooYears")
			.withIndex("by_isDefault", (q) => q.eq("isDefault", true))
			.first();

		if (currentDefault) {
			await ctx.db.patch(currentDefault._id, { isDefault: false });
		}

		// Set new default
		await ctx.db.patch(args.yearId, { isDefault: true });
	},
});

export const updateYearLastChecked = mutation({
	args: { yearId: v.id("rooYears") },
	handler: async (ctx, args) => {
		await ctx.db.patch(args.yearId, { lastCheckedAt: Date.now() });
	},
});

// ============================================================================
// Artist-Year Association
// ============================================================================

export const addArtistToYear = mutation({
	args: {
		yearId: v.id("rooYears"),
		artistId: v.id("spotifyArtists"),
		spotifyArtistId: v.string(),
	},
	handler: async (ctx, args) => {
		// Check if already exists
		const existing = await ctx.db
			.query("rooArtists")
			.withIndex("by_yearId_artistId", (q) =>
				q.eq("yearId", args.yearId).eq("artistId", args.artistId),
			)
			.first();

		if (existing) {
			return { added: false, reason: "already_exists" };
		}

		await ctx.db.insert("rooArtists", {
			yearId: args.yearId,
			artistId: args.artistId,
			spotifyArtistId: args.spotifyArtistId,
			addedAt: Date.now(),
		});

		return { added: true };
	},
});

export const removeArtistFromYear = mutation({
	args: {
		yearId: v.id("rooYears"),
		artistId: v.id("spotifyArtists"),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("rooArtists")
			.withIndex("by_yearId_artistId", (q) =>
				q.eq("yearId", args.yearId).eq("artistId", args.artistId),
			)
			.first();

		if (existing) {
			await ctx.db.delete(existing._id);
			return { removed: true };
		}

		return { removed: false, reason: "not_found" };
	},
});

export const getArtistsForYear = query({
	args: { yearId: v.id("rooYears") },
	handler: async (ctx, args) => {
		const rooArtists = await ctx.db
			.query("rooArtists")
			.withIndex("by_yearId", (q) => q.eq("yearId", args.yearId))
			.collect();

		// Fetch full artist details
		const artistsWithDetails = await Promise.all(
			rooArtists.map(async (ra) => {
				const artist = await ctx.db.get(ra.artistId);
				return {
					...ra,
					artist,
				};
			}),
		);

		// Sort alphabetically by artist name
		return artistsWithDetails.sort((a, b) => {
			const nameA = a.artist?.name?.toLowerCase() ?? "";
			const nameB = b.artist?.name?.toLowerCase() ?? "";
			return nameA.localeCompare(nameB);
		});
	},
});

// ============================================================================
// Track Dedup Management
// ============================================================================

export const addTrackToYear = mutation({
	args: {
		yearId: v.id("rooYears"),
		spotifyTrackId: v.string(),
		spotifyArtistId: v.string(),
		trackName: v.string(),
		albumName: v.string(),
		releaseDate: v.string(),
	},
	handler: async (ctx, args) => {
		// Check if track already added
		const existing = await ctx.db
			.query("rooTracksAdded")
			.withIndex("by_spotifyTrackId", (q) =>
				q.eq("spotifyTrackId", args.spotifyTrackId),
			)
			.first();

		if (existing) {
			return { added: false, reason: "already_exists" };
		}

		await ctx.db.insert("rooTracksAdded", {
			yearId: args.yearId,
			spotifyTrackId: args.spotifyTrackId,
			spotifyArtistId: args.spotifyArtistId,
			trackName: args.trackName,
			albumName: args.albumName,
			releaseDate: args.releaseDate,
			addedAt: Date.now(),
		});

		return { added: true };
	},
});

export const getTracksAddedForYear = query({
	args: {
		yearId: v.id("rooYears"),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const tracks = await ctx.db
			.query("rooTracksAdded")
			.withIndex("by_yearId_addedAt", (q) => q.eq("yearId", args.yearId))
			.order("desc")
			.collect();

		if (args.limit) {
			return tracks.slice(0, args.limit);
		}
		return tracks;
	},
});

export const isTrackAdded = query({
	args: { spotifyTrackId: v.string() },
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("rooTracksAdded")
			.withIndex("by_spotifyTrackId", (q) =>
				q.eq("spotifyTrackId", args.spotifyTrackId),
			)
			.first();

		return existing !== null;
	},
});

// ============================================================================
// Bulk Operations (for playlist import)
// ============================================================================

export const bulkUpsertArtists = mutation({
	args: {
		artists: v.array(
			v.object({
				spotifyArtistId: v.string(),
				name: v.string(),
				imageUrl: v.optional(v.string()),
				genres: v.optional(v.array(v.string())),
				popularity: v.optional(v.number()),
				rawData: v.optional(v.string()),
			}),
		),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const results = { added: 0, updated: 0 };

		for (const artist of args.artists) {
			const existing = await ctx.db
				.query("spotifyArtists")
				.withIndex("by_spotifyArtistId", (q) =>
					q.eq("spotifyArtistId", artist.spotifyArtistId),
				)
				.first();

			if (existing) {
				await ctx.db.patch(existing._id, {
					name: artist.name,
					imageUrl: artist.imageUrl,
					genres: artist.genres,
					popularity: artist.popularity,
					rawData: artist.rawData,
					updatedAt: now,
				});
				results.updated++;
			} else {
				await ctx.db.insert("spotifyArtists", {
					spotifyArtistId: artist.spotifyArtistId,
					name: artist.name,
					imageUrl: artist.imageUrl,
					genres: artist.genres,
					popularity: artist.popularity,
					rawData: artist.rawData,
					createdAt: now,
					updatedAt: now,
				});
				results.added++;
			}
		}

		return results;
	},
});

export const clearArtistsFromYear = mutation({
	args: { yearId: v.id("rooYears") },
	handler: async (ctx, args) => {
		const artists = await ctx.db
			.query("rooArtists")
			.withIndex("by_yearId", (q) => q.eq("yearId", args.yearId))
			.collect();

		for (const artist of artists) {
			await ctx.db.delete(artist._id);
		}

		return { deleted: artists.length };
	},
});

export const bulkAddArtistsToYear = mutation({
	args: {
		yearId: v.id("rooYears"),
		artistIds: v.array(v.string()), // Spotify artist IDs
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const results = { added: 0, skipped: 0 };

		for (const spotifyArtistId of args.artistIds) {
			// Find the artist in our DB
			const artist = await ctx.db
				.query("spotifyArtists")
				.withIndex("by_spotifyArtistId", (q) =>
					q.eq("spotifyArtistId", spotifyArtistId),
				)
				.first();

			if (!artist) {
				results.skipped++;
				continue;
			}

			// Check if already in year
			const existing = await ctx.db
				.query("rooArtists")
				.withIndex("by_yearId_artistId", (q) =>
					q.eq("yearId", args.yearId).eq("artistId", artist._id),
				)
				.first();

			if (existing) {
				results.skipped++;
				continue;
			}

			await ctx.db.insert("rooArtists", {
				yearId: args.yearId,
				artistId: artist._id,
				spotifyArtistId: spotifyArtistId,
				addedAt: now,
			});
			results.added++;
		}

		return results;
	},
});

// ============================================================================
// Backfill Action
// ============================================================================

export const backfillArtistsFromTracks = action({
	args: {},
	handler: async (ctx): Promise<{
		tracksScanned: number;
		uniqueArtistsFound: number;
		alreadyExisted: number;
		newArtistsAdded: number;
		fetchErrors: number;
	}> => {
		const userId = process.env.SPOTIFY_SYNC_USER_ID;

		if (!userId) {
			throw new Error("SPOTIFY_SYNC_USER_ID not configured");
		}

		console.log("🎵 Backfilling artists from canonical tracks...");

		// Get Spotify connection and refresh token if needed
		const connection = await ctx.runQuery(api.spotify.getConnection, {
			userId,
		});

		if (!connection) {
			throw new Error(`No Spotify connection found for user: ${userId}`);
		}

		let accessToken = connection.accessToken;
		const now = Date.now();
		const isExpired = connection.expiresAt < now + 5 * 60 * 1000;

		if (isExpired) {
			console.log("🔑 Refreshing access token...");
			const clientId = process.env.SPOTIFY_CLIENT_ID;
			const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

			if (!clientId || !clientSecret) {
				throw new Error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET");
			}

			const tokenResponse = await fetch(
				"https://accounts.spotify.com/api/token",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
						Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
					},
					body: new URLSearchParams({
						grant_type: "refresh_token",
						refresh_token: connection.refreshToken,
					}),
				},
			);

			if (!tokenResponse.ok) {
				throw new Error(`Failed to refresh token: ${await tokenResponse.text()}`);
			}

			const tokens = await tokenResponse.json();
			accessToken = tokens.access_token;

			await ctx.runMutation(api.spotify.updateTokens, {
				userId,
				accessToken: tokens.access_token,
				expiresIn: tokens.expires_in,
				refreshToken: tokens.refresh_token,
			});
		}

		// Get all canonical tracks
		const tracks = await ctx.runQuery(api.spotify.getAllCanonicalTracks, {});
		console.log(`📚 Found ${tracks.length} canonical tracks`);

		// Extract unique artist IDs from rawData
		const artistMap = new Map<string, { id: string; name: string }>();

		for (const track of tracks) {
			if (!track.rawData) continue;

			try {
				const data = JSON.parse(track.rawData);
				if (data.artists && Array.isArray(data.artists)) {
					for (const artist of data.artists) {
						if (artist.id && artist.name && !artistMap.has(artist.id)) {
							artistMap.set(artist.id, { id: artist.id, name: artist.name });
						}
					}
				}
			} catch {
				// Skip tracks with invalid rawData
			}
		}

		console.log(`🎤 Found ${artistMap.size} unique artists in track data`);

		// Check which artists already exist
		const artistIds = Array.from(artistMap.keys());
		const existingArtistIds = new Set<string>();

		for (const id of artistIds) {
			const existing = await ctx.runQuery(api.rooleases.getArtistBySpotifyId, {
				spotifyArtistId: id,
			});
			if (existing) {
				existingArtistIds.add(id);
			}
		}

		const missingArtistIds = artistIds.filter(
			(id) => !existingArtistIds.has(id),
		);
		console.log(`   ${existingArtistIds.size} already exist`);
		console.log(`   ${missingArtistIds.length} need to be fetched`);

		if (missingArtistIds.length === 0) {
			return {
				tracksScanned: tracks.length,
				uniqueArtistsFound: artistMap.size,
				alreadyExisted: existingArtistIds.size,
				newArtistsAdded: 0,
				fetchErrors: 0,
			};
		}

		// Fetch missing artists from Spotify in batches of 50
		type SpotifyArtist = {
			id: string;
			name: string;
			images: Array<{ url: string }>;
			genres: string[];
			popularity: number;
		};

		const allArtistDetails: SpotifyArtist[] = [];
		let fetchErrors = 0;

		for (let i = 0; i < missingArtistIds.length; i += 50) {
			const batch = missingArtistIds.slice(i, i + 50);
			console.log(
				`📡 Fetching batch ${Math.floor(i / 50) + 1}/${Math.ceil(missingArtistIds.length / 50)}`,
			);

			try {
				const response = await fetch(
					`https://api.spotify.com/v1/artists?ids=${batch.join(",")}`,
					{
						headers: { Authorization: `Bearer ${accessToken}` },
					},
				);

				if (!response.ok) {
					console.error(`Spotify API error: ${await response.text()}`);
					fetchErrors++;
					continue;
				}

				const data = await response.json();
				const artists = data.artists.filter(
					(a: SpotifyArtist | null) => a !== null,
				);
				allArtistDetails.push(...artists);
			} catch (error) {
				console.error(`Error fetching batch: ${error}`);
				fetchErrors++;
			}
		}

		// Save to database
		console.log(`💾 Saving ${allArtistDetails.length} artists...`);

		const artistsToSave = allArtistDetails.map((artist) => ({
			spotifyArtistId: artist.id,
			name: artist.name,
			imageUrl: artist.images[0]?.url,
			genres: artist.genres,
			popularity: artist.popularity,
			rawData: JSON.stringify(artist),
		}));

		// Batch insert
		for (let i = 0; i < artistsToSave.length; i += 25) {
			const batch = artistsToSave.slice(i, i + 25);
			await ctx.runMutation(api.rooleases.bulkUpsertArtists, {
				artists: batch,
			});
		}

		console.log(`✅ Done! Added ${allArtistDetails.length} new artists.`);

		return {
			tracksScanned: tracks.length,
			uniqueArtistsFound: artistMap.size,
			alreadyExisted: existingArtistIds.size,
			newArtistsAdded: allArtistDetails.length,
			fetchErrors,
		};
	},
});
