import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
	folioSocietyConfig: defineTable({
		startId: v.number(),
		endId: v.number(),
		updatedAt: v.number(), // Unix timestamp - more efficient for database operations
	}),

	folioSocietyReleases: defineTable({
		id: v.number(), // External ID from Folio Society API
		sku: v.string(),
		name: v.string(),
		url: v.string(),
		visibility: v.any(), // JSON data from API
		image: v.optional(v.string()),
		price: v.optional(v.number()),
		isActive: v.boolean(),
		firstSeenAt: v.number(), // Unix timestamp
		lastSeenAt: v.number(), // Unix timestamp
		lastUpdatedAt: v.number(), // Unix timestamp
	})
		.index("by_external_id", ["id"]) // For unique lookups by external ID
		.index("by_firstSeenAt", ["firstSeenAt"]) // For date range queries
		.index("by_lastSeenAt", ["lastSeenAt"]) // For recent activity
		.index("by_isActive", ["isActive"]), // For filtering active/inactive

	folioSocietyProductDetails: defineTable({
		productId: v.number(), // Maps to folioSocietyReleases.id
		slug: v.string(),
		sku: v.string(),
		name: v.string(),

		price: v.optional(v.number()),
		availability: v.optional(v.string()),
		isInStock: v.optional(v.boolean()),

		publicationDateText: v.optional(v.string()),
		publicationDateISO: v.optional(v.string()),
		pages: v.optional(v.number()),
		dimensions: v.optional(v.string()),
		font: v.optional(v.string()),
		illustration: v.optional(v.string()),
		presentation: v.optional(v.string()), // presentation_box_binding
		printing: v.optional(v.string()),

		authorIds: v.optional(v.array(v.number())),
		illustratorIds: v.optional(v.array(v.number())),
		translatorIds: v.optional(v.array(v.number())),

		heroImage: v.optional(v.string()),
		galleryImages: v.optional(v.array(v.string())),

		canonical: v.optional(v.string()),
		ogImage: v.optional(v.string()),
		store: v.optional(v.number()),

		lastFetchedAt: v.number(),
		fetchStatus: v.string(), // 'ok' | 'error' | 'stale'
		errorCount: v.number(),
		lastError: v.optional(v.string()),

		raw: v.any(),
	})
		.index("by_productId", ["productId"])
		.index("by_slug", ["slug"])
		.index("by_lastFetchedAt", ["lastFetchedAt"])
		.index("by_fetchStatus", ["fetchStatus"]),

	folioSocietyImages: defineTable({
		productId: v.number(),
		blobUrl: v.string(), // S3/CloudFront CDN URL
		originalUrl: v.string(), // Original Folio image URL
		originalFilename: v.string(), // Original filename from Folio API (e.g., "1q84_01_base_1.jpg")
		imageType: v.union(
			v.literal("hero"),
			v.literal("gallery"),
			v.literal("thumbnail"),
		),
		position: v.optional(v.number()), // For gallery ordering
		imageHash: v.string(), // SHA-256 hash for deduplication
		firstSeenAt: v.number(),
		lastSeenAt: v.number(),
		isActive: v.boolean(),
		metadata: v.optional(v.any()), // width, height, fileSize, contentType, etc.
	})
		.index("by_productId", ["productId"])
		.index("by_imageHash", ["imageHash"])
		.index("by_originalFilename", ["originalFilename"])
		.index("by_productId_originalFilename", ["productId", "originalFilename"])
		.index("by_isActive", ["isActive"]),

	bookSearch: defineTable({
		title: v.string(),
		author: v.string(),
		hardcover: v.boolean(),
		firstEdition: v.boolean(),
		folioSociety: v.boolean(),
		titleNorm: v.string(),
		authorNorm: v.string(),
		isbn: v.optional(v.string()),
		isbnNorm: v.string(),
		createdAt: v.number(), // Unix timestamp
		updatedAt: v.number(), // Unix timestamp
	})
		.index("by_createdAt", ["createdAt"]) // For date range queries
		.index("by_updatedAt", ["updatedAt"]) // For recent searches
		.index("by_search_key", ["titleNorm", "authorNorm", "isbnNorm"]), // For unique lookups

	geniusAlbums: defineTable({
		albumTitle: v.string(),
		artistName: v.string(),
		albumSlug: v.string(),
		geniusAlbumUrl: v.string(),
		totalSongs: v.number(),
		createdAt: v.number(), // Unix timestamp
		updatedAt: v.number(), // Unix timestamp
	})
		.index("by_albumSlug", ["albumSlug"]) // For slug-based lookups
		.index("by_updatedAt", ["updatedAt"]), // For recent albums

	geniusSongs: defineTable({
		albumId: v.id("geniusAlbums"),
		songTitle: v.string(),
		geniusSongUrl: v.string(),
		trackNumber: v.number(),
		lyrics: v.string(),
		about: v.optional(v.string()),
		createdAt: v.number(), // Unix timestamp
	})
		.index("by_albumId", ["albumId"]) // For fetching songs by album
		.index("by_trackNumber", ["trackNumber"]), // For ordering songs

	articles: defineTable({
		userId: v.string(),
		url: v.string(),
		title: v.string(),
		author: v.optional(v.string()),
		siteName: v.optional(v.string()),
		publishedDate: v.optional(v.string()),
		excerpt: v.optional(v.string()),
		content: v.string(), // Clean HTML from Readability
		textContent: v.string(), // Plain text for search
		readingTime: v.optional(v.number()), // minutes
		savedAt: v.number(), // Unix timestamp
	})
		.index("by_userId", ["userId"])
		.index("by_userId_savedAt", ["userId", "savedAt"]),

	// Spotify Playlister tables
	spotifyConnections: defineTable({
		userId: v.string(), // Maps to your existing auth user
		accessToken: v.string(),
		refreshToken: v.string(),
		expiresAt: v.number(), // Unix timestamp when access token expires
		spotifyUserId: v.string(), // Spotify's user ID
		displayName: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_userId", ["userId"])
		.index("by_spotifyUserId", ["spotifyUserId"]),

	spotifyPlaylists: defineTable({
		userId: v.string(), // Your auth user
		spotifyPlaylistId: v.string(), // Spotify's playlist ID
		name: v.string(),
		description: v.string(), // AI-generated mood/vibe description for AI matching
		userNotes: v.optional(v.string()), // Original user input for regeneration
		imageUrl: v.optional(v.string()),
		isActive: v.boolean(), // Whether to include in AI suggestions
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_userId", ["userId"])
		.index("by_userId_active", ["userId", "isActive"])
		.index("by_spotifyPlaylistId", ["spotifyPlaylistId"]),

	spotifySongCategorizations: defineTable({
		userId: v.string(),
		trackId: v.string(), // Spotify track ID
		trackName: v.string(),
		artistName: v.string(),
		albumName: v.optional(v.string()),
		albumImageUrl: v.optional(v.string()),
		trackData: v.optional(v.string()), // JSON stringified SpotifyTrack for re-categorization
		userInput: v.string(), // What user typed about the song's vibe
		aiSuggestions: v.array(
			v.object({
				playlistId: v.string(),
				playlistName: v.string(),
				confidence: v.string(), // 'high' | 'medium' | 'low'
				reason: v.string(),
			}),
		),
		finalSelections: v.array(v.string()), // Playlist IDs user confirmed
		createdAt: v.number(),
	})
		.index("by_userId", ["userId"])
		.index("by_trackId", ["trackId"])
		.index("by_userId_createdAt", ["userId", "createdAt"]),

	spotifyTracks: defineTable({
		userId: v.string(),
		trackId: v.string(),
		trackName: v.string(),
		artistName: v.string(),
		albumName: v.optional(v.string()),
		albumImageUrl: v.optional(v.string()),
		spotifyAlbumId: v.optional(v.string()), // Spotify's album ID for grouping
		trackData: v.optional(v.string()), // JSON stringified SpotifyTrack
		firstSeenAt: v.number(),
		lastSeenAt: v.number(),
		lastPlayedAt: v.optional(v.number()),
		lastLikedAt: v.optional(v.number()),
		lastCategorizedAt: v.optional(v.number()),
	})
		.index("by_userId", ["userId"])
		.index("by_userId_trackId", ["userId", "trackId"])
		.index("by_userId_lastSeenAt", ["userId", "lastSeenAt"])
		.index("by_userId_albumId", ["userId", "spotifyAlbumId"])
		.index("by_userId_lastPlayedAt", ["userId", "lastPlayedAt"]),

	spotifyPendingSuggestions: defineTable({
		userId: v.string(),
		trackId: v.string(), // Spotify track ID
		userInput: v.string(), // User's description before submitting
		suggestions: v.array(
			v.object({
				playlistId: v.string(),
				playlistName: v.string(),
				confidence: v.string(), // 'high' | 'medium' | 'low'
				reason: v.string(),
			}),
		),
		createdAt: v.number(),
	})
		.index("by_trackId", ["trackId"])
		.index("by_userId", ["userId"]),

	// Spotify Album tracking tables
	spotifyAlbums: defineTable({
		spotifyAlbumId: v.string(), // Spotify's album ID
		name: v.string(),
		artistName: v.string(),
		imageUrl: v.optional(v.string()),
		releaseDate: v.optional(v.string()),
		totalTracks: v.number(),
		genres: v.optional(v.array(v.string())),
		rawData: v.optional(v.string()), // JSON stringified full Spotify response
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_spotifyAlbumId", ["spotifyAlbumId"])
		.index("by_createdAt", ["createdAt"]),

	userAlbums: defineTable({
		userId: v.string(),
		albumId: v.id("spotifyAlbums"), // Reference to spotifyAlbums
		rating: v.optional(v.number()), // 1-15 rating mapped to tiers (High/Med/Low per tier)
		position: v.optional(v.number()), // Float for ordering within year (fractional indexing)
		category: v.optional(v.string()), // For future use
		firstListenedAt: v.number(),
		lastListenedAt: v.number(),
		listenCount: v.number(), // Denormalized count for quick access
	})
		.index("by_userId", ["userId"])
		.index("by_userId_albumId", ["userId", "albumId"])
		.index("by_userId_lastListenedAt", ["userId", "lastListenedAt"]),

	userAlbumListens: defineTable({
		userId: v.string(),
		albumId: v.id("spotifyAlbums"), // Reference to spotifyAlbums
		listenedAt: v.number(), // Timestamp when we recorded the listen
		earliestPlayedAt: v.number(), // Min played_at from session tracks
		latestPlayedAt: v.number(), // Max played_at from session tracks
		trackIds: v.array(v.string()), // Spotify track IDs that were played
		source: v.string(), // e.g., "recently_played_sync"
	})
		.index("by_userId", ["userId"])
		.index("by_userId_albumId", ["userId", "albumId"])
		.index("by_userId_listenedAt", ["userId", "listenedAt"]),

	spotifySyncLogs: defineTable({
		userId: v.string(),
		syncType: v.string(), // "recently_played" | "liked_tracks"
		rawResponse: v.string(), // JSON blob of Spotify API response
		status: v.string(), // "pending" | "processed" | "failed"
		processedAt: v.optional(v.number()),
		error: v.optional(v.string()),
		createdAt: v.number(),
	})
		.index("by_userId", ["userId"])
		.index("by_status", ["status"])
		.index("by_userId_createdAt", ["userId", "createdAt"]),

	spotifySyncRuns: defineTable({
		userId: v.string(),
		source: v.string(), // "manual" | "cron"
		status: v.string(), // "success" | "failed"
		startedAt: v.number(),
		completedAt: v.number(),
		durationMs: v.number(),
		error: v.optional(v.string()),

		// Track stats
		tracksFromApi: v.number(), // Total tracks returned from Spotify API
		uniqueTracksFromApi: v.number(), // Unique track IDs
		newTracksAdded: v.number(), // Tracks that didn't exist before
		existingTracksUpdated: v.number(), // Tracks that were updated

		// Album stats
		uniqueAlbumsFromApi: v.number(), // Unique album IDs in the API response
		albumsAlreadyInDb: v.number(), // Albums we already had
		newAlbumsDiscovered: v.number(), // New albums fetched from Spotify
		albumsFetchFailed: v.number(), // Albums we couldn't fetch

		// Listen detection stats
		albumsCheckedForListens: v.number(), // Albums evaluated for majority threshold
		albumListensRecorded: v.number(), // Album listens that met threshold

		// Backfill stats
		tracksBackfilledFromAlbums: v.number(), // Tracks added from album discovery

		// Details for debugging
		newAlbumNames: v.optional(v.array(v.string())), // Names of newly discovered albums
		recordedListenAlbumNames: v.optional(v.array(v.string())), // Albums where listens were recorded
	})
		.index("by_userId", ["userId"])
		.index("by_userId_startedAt", ["userId", "startedAt"]),
});
