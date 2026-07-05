import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
	zineCoverTextAlignValidator,
	zineCoverTextAnchorValidator,
} from "./_utils/zineCoverTextLayout";
import {
	zineInsideBackArtistDisplayValidator,
	zineInsideBackContentAlignStoredValidator,
	zineInsideBackRecommendationRowAlignValidator,
} from "./_utils/zineInsideBackLayout";
import { zineInsideBackSectionsValidator } from "./_utils/zineInsideBackSections";

const geniusCreditValidator = v.object({
	label: v.string(),
	contributors: v.array(
		v.object({
			name: v.string(),
			url: v.optional(v.string()),
		}),
	),
});

const zineDisplaySettingsValidator = v.object({
	showArtist: v.optional(v.boolean()),
	showAlbum: v.optional(v.boolean()),
	showYear: v.optional(v.boolean()),
	showAlbumArt: v.optional(v.boolean()),
	showIntro: v.optional(v.boolean()),
	showGeniusInfo: v.optional(v.boolean()),
	showSectionLabels: v.optional(v.boolean()),
	showUserNote: v.optional(v.boolean()),
	separateInstrumentalPages: v.optional(v.boolean()),
});

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
		zineCoverImageUrl: v.optional(v.string()),
		zineCoverImageStorageId: v.optional(v.id("_storage")),
		zineCoverGreyscale: v.optional(v.boolean()),
		zineCoverTextAnchor: v.optional(zineCoverTextAnchorValidator),
		zineCoverTextAlign: v.optional(zineCoverTextAlignValidator),
		zineCoverTextOffsetXIn: v.optional(v.number()),
		zineCoverTextOffsetYIn: v.optional(v.number()),
		zineCoverReleaseYear: v.optional(v.number()),
		introPageContent: v.optional(v.string()),
		zineIntroParagraphSpacingPt: v.optional(v.number()),
		zineIntroMarginPt: v.optional(v.number()),
		zineIntroVerticalAlign: v.optional(
			v.union(v.literal("top"), v.literal("center")),
		),
		zineIntroFontSizePt: v.optional(v.number()),
		zineDisplaySettings: v.optional(zineDisplaySettingsValidator),
		zineInsideBackSections: v.optional(zineInsideBackSectionsValidator),
		zineInsideBackMarginTopPt: v.optional(v.number()),
		zineInsideBackMarginRightPt: v.optional(v.number()),
		zineInsideBackMarginBottomPt: v.optional(v.number()),
		zineInsideBackMarginLeftPt: v.optional(v.number()),
		zineInsideBackContentAlign: v.optional(
			zineInsideBackContentAlignStoredValidator,
		),
		zineInsideBackArtistDisplay: v.optional(zineInsideBackArtistDisplayValidator),
		zineInsideBackRecommendationRowAlign: v.optional(
			zineInsideBackRecommendationRowAlignValidator,
		),
		albumTitleOverride: v.optional(v.string()),
		artistNameOverride: v.optional(v.string()),
		summaryOverride: v.optional(v.string()),
		frontPageImageUrlOverride: v.optional(v.string()),
		spotifyAlbumId: v.optional(v.string()),
		spotifyAlbumConvexId: v.optional(v.id("spotifyAlbums")),
		spotifyAlbumMatchMethod: v.optional(
			v.union(
				v.literal("spotify_id"),
				v.literal("title_artist"),
				v.literal("manual"),
			),
		),
		spotifyAlbumMatchedAt: v.optional(v.number()),
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
		credits: v.optional(v.array(geniusCreditValidator)),
		scrapeState: v.optional(v.union(v.literal("ready"), v.literal("failed"))),
		scrapeError: v.optional(v.string()),
		songTitleOverride: v.optional(v.string()),
		lyricsOverride: v.optional(v.string()),
		aboutOverride: v.optional(v.string()),
		durationSecondsOverride: v.optional(v.number()),
		hiddenCreditLabels: v.optional(v.array(v.string())),
		shownCreditLabels: v.optional(v.array(v.string())),
		zineLyricsColumnCount: v.optional(v.union(v.literal(1), v.literal(2))),
		zineLyricsFontSizePt: v.optional(v.number()),
		zineTitleCondenseScale: v.optional(v.number()),
		zineShowCredits: v.optional(v.boolean()),
		createdAt: v.number(), // Unix timestamp
	})
		.index("by_albumId", ["albumId"]) // For fetching songs by album
		.index("by_trackNumber", ["trackNumber"]), // For ordering songs

	playlistLyrics: defineTable({
		title: v.string(),
		slug: v.string(),
		theme: v.optional(v.string()),
		description: v.optional(v.string()),
		notes: v.optional(v.string()),
		zineCoverImageUrl: v.optional(v.string()),
		zineCoverImageStorageId: v.optional(v.id("_storage")),
		zineCoverGreyscale: v.optional(v.boolean()),
		zineCoverTextAnchor: v.optional(zineCoverTextAnchorValidator),
		zineCoverTextAlign: v.optional(zineCoverTextAlignValidator),
		zineCoverTextOffsetXIn: v.optional(v.number()),
		zineCoverTextOffsetYIn: v.optional(v.number()),
		zineCoverReleaseYear: v.optional(v.number()),
		zineSpotifyQrStorageId: v.optional(v.id("_storage")),
		zineSpotifyQrImageUrl: v.optional(v.string()),
		zineAppleMusicQrStorageId: v.optional(v.id("_storage")),
		zineAppleMusicQrImageUrl: v.optional(v.string()),
		zineShowSpotifyQr: v.optional(v.boolean()),
		zineShowAppleMusicQr: v.optional(v.boolean()),
		zineDisplaySettings: v.optional(zineDisplaySettingsValidator),
		zineInsideBackSections: v.optional(zineInsideBackSectionsValidator),
		zineInsideBackMarginTopPt: v.optional(v.number()),
		zineInsideBackMarginRightPt: v.optional(v.number()),
		zineInsideBackMarginBottomPt: v.optional(v.number()),
		zineInsideBackMarginLeftPt: v.optional(v.number()),
		zineInsideBackContentAlign: v.optional(
			zineInsideBackContentAlignStoredValidator,
		),
		zineInsideBackArtistDisplay: v.optional(zineInsideBackArtistDisplayValidator),
		zineInsideBackRecommendationRowAlign: v.optional(
			zineInsideBackRecommendationRowAlignValidator,
		),
		status: v.union(v.literal("draft"), v.literal("ready")),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_slug", ["slug"])
		.index("by_updatedAt", ["updatedAt"])
		.index("by_status", ["status"]),

	geniusLyricScrapes: defineTable({
		canonicalUrl: v.string(),
		songTitle: v.string(),
		artistName: v.string(),
		albumTitle: v.optional(v.string()),
		albumYear: v.optional(v.string()),
		albumArtUrl: v.optional(v.string()),
		lyrics: v.string(),
		about: v.optional(v.string()),
		credits: v.optional(v.array(geniusCreditValidator)),
		scrapeStatus: v.union(v.literal("ready"), v.literal("failed")),
		lastScrapedAt: v.number(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_canonicalUrl", ["canonicalUrl"])
		.index("by_updatedAt", ["updatedAt"])
		.index("by_scrapeStatus", ["scrapeStatus"]),

	playlistLyricsItems: defineTable({
		playlistId: v.id("playlistLyrics"),
		lyricScrapeId: v.optional(v.id("geniusLyricScrapes")),
		position: v.number(),
		userNote: v.optional(v.string()),
		introContent: v.optional(v.string()),
		songTitleOverride: v.optional(v.string()),
		artistNameOverride: v.optional(v.string()),
		albumTitleOverride: v.optional(v.string()),
		albumArtUrlOverride: v.optional(v.string()),
		zineLyricsColumnCount: v.optional(v.union(v.literal(1), v.literal(2))),
		zineLyricsFontSizePt: v.optional(v.number()),
		zineTitleCondenseScale: v.optional(v.number()),
		zineShowCredits: v.optional(v.boolean()),
		durationSecondsOverride: v.optional(v.number()),
		hiddenCreditLabels: v.optional(v.array(v.string())),
		shownCreditLabels: v.optional(v.array(v.string())),
		pendingUrl: v.optional(v.string()),
		scrapeState: v.union(
			v.literal("scraping"),
			v.literal("ready"),
			v.literal("failed"),
			v.literal("reused"),
			v.literal("manual"),
		),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_playlistId", ["playlistId"])
		.index("by_playlistId_position", ["playlistId", "position"])
		.index("by_lyricScrapeId", ["lyricScrapeId"]),

	geniusCreditLabels: defineTable({
		key: v.string(),
		label: v.string(),
		hiddenByDefault: v.boolean(),
		ignored: v.optional(v.boolean()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_key", ["key"])
		.index("by_hiddenByDefault", ["hiddenByDefault"])
		.index("by_ignored", ["ignored"]),

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
		canonicalTrackId: v.optional(v.id("spotifyTracksCanonical")), // Reference to canonical (optional during migration)
		spotifyTrackId: v.optional(v.string()), // Spotify track ID (optional during migration, use trackId as fallback)
		// Legacy denormalized fields - kept during migration
		trackId: v.optional(v.string()), // @deprecated - use spotifyTrackId
		trackName: v.optional(v.string()), // @deprecated - use canonical
		artistName: v.optional(v.string()), // @deprecated - use canonical
		albumName: v.optional(v.string()), // @deprecated - use canonical
		albumImageUrl: v.optional(v.string()), // @deprecated - use canonical
		trackData: v.optional(v.string()), // @deprecated - use canonical rawData
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
		.index("by_spotifyTrackId", ["spotifyTrackId"])
		.index("by_trackId", ["trackId"]) // Legacy index
		.index("by_userId_createdAt", ["userId", "createdAt"]),

	// User-specific track data (references spotifyTracksCanonical for metadata)
	userTracks: defineTable({
		userId: v.string(),
		trackId: v.id("spotifyTracksCanonical"), // Reference to canonical track
		spotifyTrackId: v.string(), // Denormalized for easy lookups
		firstSeenAt: v.number(),
		lastSeenAt: v.number(),
		lastPlayedAt: v.optional(v.number()),
		lastLikedAt: v.optional(v.number()),
		lastCategorizedAt: v.optional(v.number()),
	})
		.index("by_userId", ["userId"])
		.index("by_userId_spotifyTrackId", ["userId", "spotifyTrackId"])
		.index("by_userId_lastSeenAt", ["userId", "lastSeenAt"])
		.index("by_userId_lastPlayedAt", ["userId", "lastPlayedAt"]),

	// Legacy table - kept during migration, will be removed after data is migrated
	spotifyTracks: defineTable({
		userId: v.string(),
		trackId: v.string(),
		trackName: v.string(),
		artistName: v.string(),
		albumName: v.optional(v.string()),
		albumImageUrl: v.optional(v.string()),
		spotifyAlbumId: v.optional(v.string()),
		trackData: v.optional(v.string()),
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

	// Canonical Spotify track data (global, shared across users)
	spotifyTracksCanonical: defineTable({
		spotifyTrackId: v.string(), // Spotify's track ID (unique)
		trackName: v.string(),
		artistName: v.string(), // Primary artist display name
		artistIds: v.optional(v.array(v.string())), // Spotify artist IDs for all artists
		albumName: v.optional(v.string()),
		albumImageUrl: v.optional(v.string()),
		spotifyAlbumId: v.optional(v.string()),
		// Extracted from Spotify API response:
		durationMs: v.optional(v.number()),
		trackNumber: v.optional(v.number()),
		isExplicit: v.optional(v.boolean()),
		previewUrl: v.optional(v.string()),
		// Legacy fields - kept for existing data, not written anymore
		rawData: v.optional(v.string()),
		hasRawData: v.optional(v.boolean()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_spotifyTrackId", ["spotifyTrackId"])
		.index("by_spotifyAlbumId", ["spotifyAlbumId"]),

	// Spotify Album tracking tables
	spotifyAlbums: defineTable({
		spotifyAlbumId: v.string(), // Spotify's album ID
		name: v.string(),
		albumTitleKey: v.optional(v.string()),
		artistName: v.string(),
		imageUrl: v.optional(v.string()),
		releaseDate: v.optional(v.string()),
		totalTracks: v.number(),
		genres: v.optional(v.array(v.string())),
		rawData: v.optional(v.string()), // JSON stringified full Spotify response
		rymNotOnSite: v.optional(v.boolean()),
		/** Sum of playlist track durations seen for this album (ms). */
		totalDurationMs: v.optional(v.number()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_spotifyAlbumId", ["spotifyAlbumId"])
		.index("by_albumTitleKey", ["albumTitleKey"])
		.index("by_createdAt", ["createdAt"]),

	albumLibraryItems: defineTable({
		userId: v.string(),
		albumId: v.id("spotifyAlbums"),
		spotifyAlbumId: v.string(),
		name: v.string(),
		artistName: v.string(),
		artistSortKey: v.string(),
		releaseYearSortKey: v.optional(v.number()),
		albumSortKey: v.string(),
		imageUrl: v.optional(v.string()),
		releaseDate: v.optional(v.string()),
		releaseYear: v.optional(v.number()),
		totalTracks: v.number(),
		albumType: v.union(v.literal("album"), v.literal("single")),
		createdAt: v.number(),
		updatedAt: v.number(),
		listenCount: v.number(),
		firstListenedAt: v.optional(v.number()),
		lastListenedAt: v.optional(v.number()),
		rating: v.optional(v.number()),
		filterHasListened: v.boolean(),
		rymStatus: v.union(v.literal("linked"), v.literal("unlinked")),
		rymNotOnSite: v.optional(v.boolean()),
		rymScrapeId: v.optional(v.id("rateYourMusicScrapes")),
		rymLinkMethod: v.optional(
			v.union(
				v.literal("spotify_id"),
				v.literal("title_artist"),
				v.literal("manual"),
			),
		),
		rymUrl: v.optional(v.string()),
		rymLinkedAt: v.optional(v.number()),
		appearsInRobRankings: v.boolean(),
		robRankingYears: v.array(v.number()),
		primaryGenres: v.array(v.object({ key: v.string(), label: v.string() })),
		secondaryGenres: v.array(v.object({ key: v.string(), label: v.string() })),
		descriptors: v.array(v.object({ key: v.string(), label: v.string() })),
		searchText: v.string(),
	})
		.index("by_userId_albumId", ["userId", "albumId"])
		.index("by_albumId", ["albumId"])
		.index("by_userId_createdAt", ["userId", "createdAt"])
		.index("by_userId_artistSortKey_releaseYearSortKey_albumSortKey", [
			"userId",
			"artistSortKey",
			"releaseYearSortKey",
			"albumSortKey",
		])
		.index("by_userId_releaseYear_createdAt", [
			"userId",
			"releaseYear",
			"createdAt",
		])
		.index("by_userId_filterHasListened_createdAt", [
			"userId",
			"filterHasListened",
			"createdAt",
		])
		.index("by_userId_rymStatus_createdAt", [
			"userId",
			"rymStatus",
			"createdAt",
		])
		.index("by_userId_albumType_createdAt", [
			"userId",
			"albumType",
			"createdAt",
		])
		.index("by_userId_appearsInRobRankings_createdAt", [
			"userId",
			"appearsInRobRankings",
			"createdAt",
		])
		.searchIndex("search_albumLibraryItems", {
			searchField: "searchText",
			filterFields: [
				"userId",
				"releaseYear",
				"filterHasListened",
				"rymStatus",
				"albumType",
				"appearsInRobRankings",
			],
		}),

	forLaterAlbumItems: defineTable({
		userId: v.string(),
		albumId: v.id("spotifyAlbums"),
		spotifyAlbumId: v.string(),

		albumTitleKey: v.string(),
		artistKeys: v.array(v.string()),

		sourceTrackIds: v.array(v.string()),
		playlistAddedAt: v.optional(v.number()),
		firstSeenAt: v.number(),
		lastSeenAt: v.number(),
		removedAt: v.optional(v.number()),
		isActive: v.boolean(),

		rymDiscoveryStatus: v.union(
			v.literal("not_started"),
			v.literal("queued"),
			v.literal("searching"),
			v.literal("found"),
			v.literal("not_found"),
			v.literal("failed"),
		),
		rymCandidateUrl: v.optional(v.string()),
		rymCandidateConfidence: v.optional(
			v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
		),
		rymDiscoveryReason: v.optional(v.string()),
		rymDiscoveryUpdatedAt: v.optional(v.number()),

		rymScrapeId: v.optional(v.id("rateYourMusicScrapes")),
		rymMatchMethod: v.optional(
			v.union(
				v.literal("spotify_id"),
				v.literal("title_artist"),
				v.literal("manual"),
			),
		),
		rymMatchedAt: v.optional(v.number()),

		/** User marked this album as absent from Rate Your Music. */
		rymNotOnSite: v.optional(v.boolean()),
		/** User marked this as a single — hidden from for-later lists (soft delete). */
		markedAsSingle: v.optional(v.boolean()),
		/** User dismissed from for-later list — hidden from lists (soft delete). */
		removedFromForLater: v.optional(v.boolean()),

		createdAt: v.number(),
		updatedAt: v.number(),

		filterReleaseYear: v.optional(v.number()),
		filterHasListened: v.optional(v.boolean()),
		filterRymMatched: v.optional(v.boolean()),
		filterHasRymUrl: v.optional(v.boolean()),
		filterRymNotOnSite: v.optional(v.boolean()),
		filterMarkedAsSingle: v.optional(v.boolean()),
		filterRemovedFromForLater: v.optional(v.boolean()),
		filterGenreKeysSorted: v.optional(v.array(v.string())),
		filterDescriptorKeysSorted: v.optional(v.array(v.string())),
		/** Copied from `spotifyAlbums.totalDurationMs` for list filters (ms). */
		filterDurationMs: v.optional(v.number()),
		/** Minute bucket key derived from `filterDurationMs` for facet pagination. */
		filterDurationBucketKey: v.optional(v.string()),
		/** Album title + artist; Convex FTS (`search_forLaterAlbumItems`). */
		filterSearchText: v.optional(v.string()),
	})
		.index("by_userId", ["userId"])
		.index("by_userId_active", ["userId", "isActive"])
		.index("by_userId_lastSeenAt", ["userId", "lastSeenAt"])
		.index("by_userId_albumId", ["userId", "albumId"])
		.index("by_userId_spotifyAlbumId", ["userId", "spotifyAlbumId"])
		.index("by_userId_albumTitleKey", ["userId", "albumTitleKey"])
		.index("by_rymScrapeId", ["rymScrapeId"])
		.index("by_rymDiscoveryStatus", ["rymDiscoveryStatus"])
		.index("by_userId_isActive_lastSeenAt", [
			"userId",
			"isActive",
			"lastSeenAt",
		])
		.index("by_userId_rymScrapeId", ["userId", "rymScrapeId"])
		.index("by_userId_rymDiscoveryStatus", ["userId", "rymDiscoveryStatus"])
		.index("by_userId_filterReleaseYear_lastSeenAt", [
			"userId",
			"filterReleaseYear",
			"lastSeenAt",
		])
		.index("by_userId_filterHasListened_lastSeenAt", [
			"userId",
			"filterHasListened",
			"lastSeenAt",
		])
		.index("by_userId_filterRymMatched_lastSeenAt", [
			"userId",
			"filterRymMatched",
			"lastSeenAt",
		])
		.index("by_userId_filterHasRymUrl_lastSeenAt", [
			"userId",
			"filterHasRymUrl",
			"lastSeenAt",
		])
		.searchIndex("search_forLaterAlbumItems", {
			searchField: "filterSearchText",
			filterFields: [
				"userId",
				"filterReleaseYear",
				"filterHasListened",
				"filterRymMatched",
				"filterHasRymUrl",
			],
		}),

	/** One row per (item, genre tag) for indexed genre-filtered list pagination. */
	forLaterAlbumGenreFacets: defineTable({
		userId: v.string(),
		itemId: v.id("forLaterAlbumItems"),
		genreKey: v.string(),
		/** Denormalized from `forLaterAlbumItems.lastSeenAt` for sort alignment. */
		lastSeenAt: v.number(),
	})
		.index("by_userId_genreKey_lastSeenAt", [
			"userId",
			"genreKey",
			"lastSeenAt",
		])
		.index("by_itemId", ["itemId"]),

	/** One row per (item, duration bucket) for indexed duration-filtered list pagination. */
	forLaterAlbumDurationFacets: defineTable({
		userId: v.string(),
		itemId: v.id("forLaterAlbumItems"),
		durationBucketKey: v.string(),
		/** Denormalized from `forLaterAlbumItems.lastSeenAt` for sort alignment. */
		lastSeenAt: v.number(),
	})
		.index("by_userId_durationBucketKey_lastSeenAt", [
			"userId",
			"durationBucketKey",
			"lastSeenAt",
		])
		.index("by_itemId", ["itemId"]),

	/** One row per (item, descriptor tag) for indexed descriptor-filtered list pagination. */
	forLaterAlbumDescriptorFacets: defineTable({
		userId: v.string(),
		itemId: v.id("forLaterAlbumItems"),
		descriptorKey: v.string(),
		/** Denormalized from `forLaterAlbumItems.lastSeenAt` for sort alignment. */
		lastSeenAt: v.number(),
	})
		.index("by_userId_descriptorKey_lastSeenAt", [
			"userId",
			"descriptorKey",
			"lastSeenAt",
		])
		.index("by_itemId", ["itemId"]),

	forLaterAlbumRecommendations: defineTable({
		userId: v.string(),
		createdAt: v.number(),
		seed: v.string(),
		now: v.number(),
		answers: v.object({
			addedTimeframe: v.union(
				v.literal("day"),
				v.literal("week"),
				v.literal("month"),
				v.literal("two_months"),
				v.literal("older_than_two_months"),
				v.literal("any"),
			),
			genreKey: v.string(),
			releaseTime: v.union(
				v.literal("new_release"),
				v.literal("recent"),
				v.literal("modern"),
				v.literal("old"),
				v.literal("any"),
			),
			descriptorKey: v.string(),
			ratingTier: v.union(
				v.literal("holy_moly"),
				v.literal("really_enjoyed"),
				v.literal("good"),
				v.literal("any"),
			),
			durationBucket: v.optional(
				v.union(
					v.literal("under_20"),
					v.literal("20_30"),
					v.literal("30_40"),
					v.literal("40_50"),
					v.literal("50_60"),
					v.literal("60_70"),
					v.literal("70_plus"),
					v.literal("any"),
				),
			),
			/** @deprecated Use durationBucket */
			durationTier: v.optional(
				v.union(
					v.literal("short"),
					v.literal("medium"),
					v.literal("long"),
					v.literal("any"),
				),
			),
			count: v.number(),
		}),
		requestedCount: v.number(),
		matchingCount: v.number(),
		returnedCount: v.number(),
		albumItemIds: v.array(v.id("forLaterAlbumItems")),
		albumIds: v.array(v.id("spotifyAlbums")),
		spotifyAlbumIds: v.array(v.string()),
	})
		.index("by_userId_createdAt", ["userId", "createdAt"])
		.index("by_userId", ["userId"]),

	forLaterSyncRuns: defineTable({
		userId: v.string(),
		spotifyPlaylistId: v.string(),
		source: v.union(v.literal("manual"), v.literal("cron")),
		status: v.union(v.literal("success"), v.literal("failed")),
		startedAt: v.number(),
		completedAt: v.number(),
		durationMs: v.number(),
		spotifySnapshotId: v.optional(v.string()),
		tracksFromPlaylist: v.number(),
		uniqueAlbumsFromPlaylist: v.number(),
		newAlbumsAdded: v.number(),
		existingAlbumsSeen: v.number(),
		albumsMarkedRemoved: v.number(),
		rymMatchesCreated: v.number(),
		rymDiscoveryQueued: v.number(),
		error: v.optional(v.string()),
		// Max Spotify playlist row added_at seen this run (ms UTC); incremental cutoff next sync.
		playlistNewestAddedAtMs: v.optional(v.number()),
	})
		.index("by_userId_startedAt", ["userId", "startedAt"])
		.index("by_spotifyPlaylistId_startedAt", [
			"spotifyPlaylistId",
			"startedAt",
		]),

	// ============================================================================
	// Music Funnel - Curated playlist discovery pipeline
	// ============================================================================

	musicFunnelSettings: defineTable({
		userId: v.string(),
		mainPlaylistId: v.optional(v.string()),
		repeatsPlaylistId: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
	}).index("by_userId", ["userId"]),

	musicFunnelSources: defineTable({
		userId: v.string(),
		spotifyPlaylistId: v.string(),
		displayName: v.string(),
		curatorName: v.string(),
		notes: v.optional(v.string()),
		scheduleHint: v.optional(v.string()),
		isActive: v.boolean(),
		spotifyPlaylistName: v.optional(v.string()),
		spotifyOwnerId: v.optional(v.string()),
		spotifyOwnerName: v.optional(v.string()),
		imageUrl: v.optional(v.string()),
		lastSnapshotId: v.optional(v.string()),
		lastTrackCount: v.optional(v.number()),
		lastScannedAt: v.optional(v.number()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_userId", ["userId"])
		.index("by_userId_active", ["userId", "isActive"])
		.index("by_userId_spotifyPlaylistId", ["userId", "spotifyPlaylistId"]),

	musicFunnelRuns: defineTable({
		userId: v.string(),
		source: v.union(v.literal("manual"), v.literal("cron")),
		status: v.union(
			v.literal("success"),
			v.literal("partial"),
			v.literal("failed"),
		),
		startedAt: v.number(),
		completedAt: v.optional(v.number()),
		durationMs: v.optional(v.number()),
		sourcesScanned: v.number(),
		tracksSeen: v.number(),
		newEncounters: v.number(),
		newTracksAddedToMain: v.number(),
		repeatTracksAdded: v.number(),
		trackRepeatsFound: v.number(),
		albumRepeatsFound: v.number(),
		artistRepeatsFound: v.number(),
		errors: v.array(v.string()),
	})
		.index("by_userId_startedAt", ["userId", "startedAt"])
		.index("by_userId_status_startedAt", ["userId", "status", "startedAt"]),

	musicFunnelSourceRuns: defineTable({
		userId: v.string(),
		runId: v.id("musicFunnelRuns"),
		sourceId: v.id("musicFunnelSources"),
		spotifyPlaylistId: v.string(),
		sourceDisplayName: v.string(),
		status: v.union(v.literal("success"), v.literal("failed")),
		startedAt: v.number(),
		completedAt: v.optional(v.number()),
		durationMs: v.optional(v.number()),
		spotifySnapshotId: v.optional(v.string()),
		tracksFetched: v.number(),
		newEncounters: v.number(),
		alreadySeenFromSource: v.number(),
		newTracksAddedToMain: v.number(),
		repeatTracksAdded: v.number(),
		trackRepeatsFound: v.number(),
		albumRepeatsFound: v.number(),
		artistRepeatsFound: v.number(),
		error: v.optional(v.string()),
	})
		.index("by_userId_startedAt", ["userId", "startedAt"])
		.index("by_runId", ["runId"])
		.index("by_sourceId_startedAt", ["sourceId", "startedAt"]),

	musicFunnelTrackEncounters: defineTable({
		userId: v.string(),
		sourceId: v.id("musicFunnelSources"),
		spotifyPlaylistId: v.string(),
		runId: v.id("musicFunnelRuns"),
		sourceRunId: v.id("musicFunnelSourceRuns"),
		spotifyTrackId: v.string(),
		trackName: v.string(),
		trackUri: v.string(),
		primaryArtistName: v.string(),
		artists: v.array(
			v.object({
				spotifyArtistId: v.string(),
				name: v.string(),
			}),
		),
		spotifyAlbumId: v.string(),
		albumName: v.string(),
		albumImageUrl: v.optional(v.string()),
		playlistAddedAt: v.optional(v.number()),
		firstSeenAt: v.number(),
		createdAt: v.number(),
	})
		.index("by_userId_createdAt", ["userId", "createdAt"])
		.index("by_userId_spotifyTrackId", ["userId", "spotifyTrackId"])
		.index("by_userId_spotifyAlbumId", ["userId", "spotifyAlbumId"])
		.index("by_userId_sourceId_spotifyTrackId", [
			"userId",
			"sourceId",
			"spotifyTrackId",
		])
		.index("by_sourceId_createdAt", ["sourceId", "createdAt"]),

	musicFunnelPlaylistWrites: defineTable({
		userId: v.string(),
		kind: v.union(v.literal("main"), v.literal("repeat")),
		spotifyPlaylistId: v.string(),
		spotifyTrackId: v.string(),
		trackUri: v.string(),
		reason: v.union(v.literal("first_seen"), v.literal("second_source_repeat")),
		runId: v.id("musicFunnelRuns"),
		sourceRunId: v.optional(v.id("musicFunnelSourceRuns")),
		writtenAt: v.number(),
		spotifySnapshotId: v.optional(v.string()),
	})
		.index("by_userId_kind_spotifyTrackId", [
			"userId",
			"kind",
			"spotifyTrackId",
		])
		.index("by_userId_writtenAt", ["userId", "writtenAt"])
		.index("by_runId", ["runId"]),

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

	ratingHistory: defineTable({
		userId: v.string(),
		userAlbumId: v.id("userAlbums"),
		albumId: v.id("spotifyAlbums"),
		rating: v.number(), // New rating (1-15)
		previousRating: v.optional(v.number()), // Previous rating (undefined if first rating)
		ratedAt: v.number(), // Timestamp when rating was set
	})
		.index("by_userId", ["userId"])
		.index("by_userAlbumId", ["userAlbumId"])
		.index("by_userAlbumId_ratedAt", ["userAlbumId", "ratedAt"]),

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

	// Rob's Rankings - yearly top 50 album lists
	robRankingYears: defineTable({
		userId: v.string(),
		year: v.number(),
		published: v.optional(v.boolean()),
		publishedAt: v.optional(v.number()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_userId_year", ["userId", "year"])
		.index("by_published", ["published"]),

	robRankingAlbums: defineTable({
		userId: v.string(),
		yearId: v.id("robRankingYears"),
		albumId: v.optional(v.id("spotifyAlbums")),
		source: v.optional(v.union(v.literal("spotify"), v.literal("manual"))),
		artistNames: v.optional(v.array(v.string())),
		manualArtistName: v.optional(v.string()),
		manualAlbumTitle: v.optional(v.string()),
		manualImageUrl: v.optional(v.string()),
		position: v.number(), // 1-50
		status: v.string(), // "none" | "locked" | "confirmed"
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_yearId", ["yearId"])
		.index("by_yearId_position", ["yearId", "position"])
		.index("by_userId_albumId", ["userId", "albumId"]),

	// ============================================================================
	// Rooleases - Festival New Releases Tracker
	// ============================================================================

	// Canonical artist storage (populated from track syncs and playlist imports)
	spotifyArtists: defineTable({
		spotifyArtistId: v.string(),
		name: v.string(),
		imageUrl: v.optional(v.string()),
		genres: v.optional(v.array(v.string())),
		popularity: v.optional(v.number()),
		followersTotal: v.optional(v.number()),
		spotifyUrl: v.optional(v.string()),
		uri: v.optional(v.string()),
		rawData: v.optional(v.string()), // Legacy - not written anymore, kept for existing data
		lastFetchedAt: v.optional(v.number()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_spotifyArtistId", ["spotifyArtistId"])
		.index("by_name", ["name"]),

	// Festival year configuration
	rooYears: defineTable({
		year: v.number(),
		targetPlaylistId: v.string(), // Spotify playlist to add new tracks
		targetPlaylistName: v.string(),
		isDefault: v.boolean(),
		lastCheckedAt: v.optional(v.number()),
		createdAt: v.number(),
	})
		.index("by_year", ["year"])
		.index("by_isDefault", ["isDefault"]),

	// Artists tracked for a given year
	rooArtists: defineTable({
		yearId: v.id("rooYears"),
		artistId: v.id("spotifyArtists"),
		spotifyArtistId: v.string(), // Denormalized for API calls
		addedAt: v.number(),
	})
		.index("by_yearId", ["yearId"])
		.index("by_artistId", ["artistId"])
		.index("by_yearId_artistId", ["yearId", "artistId"]),

	// Backfill progress tracking
	backfillProgress: defineTable({
		key: v.string(), // e.g., "clear-rawdata"
		cursor: v.number(), // legacy
		cursorStr: v.optional(v.string()), // Convex pagination cursor
		updatedAt: v.number(),
	}).index("by_key", ["key"]),

	// Tracks already added to playlist (dedup)
	rooTracksAdded: defineTable({
		yearId: v.id("rooYears"),
		spotifyTrackId: v.string(),
		spotifyArtistId: v.string(),
		trackName: v.string(),
		albumName: v.string(),
		releaseDate: v.string(),
		addedAt: v.number(),
	})
		.index("by_yearId", ["yearId"])
		.index("by_spotifyTrackId", ["spotifyTrackId"])
		.index("by_yearId_addedAt", ["yearId", "addedAt"]),

	// Rate Your Music taxonomy (keys: trim + lowercase; labels: pretty / first-seen)
	rateYourMusicGenres: defineTable({
		key: v.string(),
		label: v.string(),
		href: v.optional(v.string()),
		description: v.optional(v.string()),
		isTopLevel: v.optional(v.boolean()),
		createdAt: v.number(),
		updatedAt: v.optional(v.number()),
	})
		.index("by_key", ["key"])
		.index("by_label", ["label"])
		.index("by_isTopLevel", ["isTopLevel"])
		.index("by_createdAt", ["createdAt"]),

	rateYourMusicGenreRelationships: defineTable({
		parentGenreId: v.id("rateYourMusicGenres"),
		childGenreId: v.id("rateYourMusicGenres"),
		parentKey: v.string(),
		childKey: v.string(),
		position: v.number(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_parentGenreId", ["parentGenreId"])
		.index("by_childGenreId", ["childGenreId"])
		.index("by_parentKey", ["parentKey"])
		.index("by_childKey", ["childKey"])
		.index("by_parentGenreId_childGenreId", ["parentGenreId", "childGenreId"]),

	rateYourMusicDescriptors: defineTable({
		key: v.string(),
		label: v.string(),
		createdAt: v.number(),
	})
		.index("by_key", ["key"])
		.index("by_createdAt", ["createdAt"]),

	// Rate Your Music release scrapes (album / EP / mixtape / compilation — extension or API)
	rateYourMusicScrapes: defineTable({
		/** Canonical https URL for this release (normalized for dedupe) */
		rymUrl: v.string(),
		releaseKind: v.union(
			v.literal("album"),
			v.literal("ep"),
			v.literal("mixtape"),
			v.literal("comp"),
		),
		/** Label from RYM "Type" row, e.g. "Album" | "EP" */
		releaseTypeLabel: v.optional(v.string()),
		albumTitle: v.string(),
		artists: v.array(
			v.object({
				name: v.string(),
				href: v.optional(v.string()),
			}),
		),
		spotifyAlbumId: v.optional(v.string()),
		spotifyAlbumUrl: v.optional(v.string()),
		spotifyAlbumConvexId: v.optional(v.id("spotifyAlbums")),
		/** Sum of track lengths from RYM track listing (seconds); optional if DOM lacked durations */
		tracklistingTotalSeconds: v.optional(v.number()),
		lastScrapedAt: v.number(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_rymUrl", ["rymUrl"])
		.index("by_spotifyAlbumId", ["spotifyAlbumId"])
		.index("by_updatedAt", ["updatedAt"]),

	/** Source of truth for RYM scrape ↔ canonical Spotify album links (many-to-many, audit). */
	rateYourMusicSpotifyAlbumLinks: defineTable({
		scrapeId: v.id("rateYourMusicScrapes"),
		albumId: v.id("spotifyAlbums"),
		spotifyAlbumId: v.optional(v.string()),
		method: v.union(
			v.literal("spotify_id"),
			v.literal("title_artist"),
			v.literal("manual"),
		),
		matchedArtistKey: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_scrapeId", ["scrapeId"])
		.index("by_albumId", ["albumId"])
		.index("by_spotifyAlbumId", ["spotifyAlbumId"])
		.index("by_scrapeId_albumId", ["scrapeId", "albumId"]),

	rateYourMusicReleaseGenres: defineTable({
		scrapeId: v.id("rateYourMusicScrapes"),
		genreId: v.id("rateYourMusicGenres"),
		role: v.union(v.literal("primary"), v.literal("secondary")),
	})
		.index("by_scrapeId", ["scrapeId"])
		.index("by_genreId", ["genreId"]),

	rateYourMusicReleaseDescriptors: defineTable({
		scrapeId: v.id("rateYourMusicScrapes"),
		descriptorId: v.id("rateYourMusicDescriptors"),
	})
		.index("by_scrapeId", ["scrapeId"])
		.index("by_descriptorId", ["descriptorId"]),

	concertVenues: defineTable({
		tmVenueId: v.string(),
		name: v.string(),
		city: v.optional(v.string()),
		stateCode: v.optional(v.string()),
		address: v.optional(v.string()),
		postalCode: v.optional(v.string()),
		latitude: v.optional(v.number()),
		longitude: v.optional(v.number()),
		firstSeenAt: v.number(),
		lastSeenAt: v.number(),
		lastFetchedAt: v.optional(v.number()),
	})
		.index("by_tmVenueId", ["tmVenueId"])
		.index("by_name", ["name"]),

	userConcertVenues: defineTable({
		userId: v.string(),
		venueId: v.id("concertVenues"),
		isSelected: v.boolean(),
		label: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_userId", ["userId"])
		.index("by_userId_venueId", ["userId", "venueId"])
		.index("by_userId_isSelected", ["userId", "isSelected"]),

	concertEvents: defineTable({
		tmEventId: v.string(),
		tmEventIds: v.optional(v.array(v.string())),
		dedupeKey: v.optional(v.string()),
		dedupeBaseKey: v.optional(v.string()),
		venueId: v.id("concertVenues"),
		name: v.string(),
		url: v.optional(v.string()),
		imageUrl: v.optional(v.string()),
		localDate: v.optional(v.string()),
		localTime: v.optional(v.string()),
		dateTime: v.optional(v.string()),
		tmStatus: v.optional(v.string()),
		publicSaleStartDateTime: v.optional(v.string()),
		attractionNames: v.array(v.string()),
		eventDates: v.optional(v.array(v.string())),
		dateRangeStart: v.optional(v.string()),
		dateRangeEnd: v.optional(v.string()),
		firstSeenAt: v.number(),
		lastSeenAt: v.number(),
		lastFetchedAt: v.number(),
	})
		.index("by_tmEventId", ["tmEventId"])
		.index("by_dedupeKey", ["dedupeKey"])
		.index("by_dedupeBaseKey", ["dedupeBaseKey"])
		.index("by_venueId", ["venueId"])
		.index("by_venueId_dateTime", ["venueId", "dateTime"])
		.index("by_venueId_dateRangeStart", ["venueId", "dateRangeStart"])
		.index("by_dateTime", ["dateTime"])
		.index("by_dateRangeStart", ["dateRangeStart"]),

	userConcertEvents: defineTable({
		userId: v.string(),
		eventId: v.id("concertEvents"),
		venueId: v.optional(v.id("concertVenues")),
		eventDate: v.optional(v.string()),
		userStatus: v.union(
			v.literal("new"),
			v.literal("interested"),
			v.literal("owned"),
			v.literal("ignored"),
		),
		notes: v.optional(v.string()),
		firstSeenAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_userId", ["userId"])
		.index("by_eventId", ["eventId"])
		.index("by_userId_eventId", ["userId", "eventId"])
		.index("by_userId_userStatus", ["userId", "userStatus"])
		.index("by_userId_eventDate", ["userId", "eventDate"])
		.index("by_userId_userStatus_eventDate", [
			"userId",
			"userStatus",
			"eventDate",
		])
		.index("by_userId_venueId_eventDate", ["userId", "venueId", "eventDate"])
		.index("by_userId_venueId_userStatus_eventDate", [
			"userId",
			"venueId",
			"userStatus",
			"eventDate",
		]),

	concertCalendarFeeds: defineTable({
		userId: v.string(),
		token: v.string(),
		createdAt: v.number(),
		updatedAt: v.number(),
		revokedAt: v.optional(v.number()),
	})
		.index("by_userId", ["userId"])
		.index("by_token", ["token"]),
});
