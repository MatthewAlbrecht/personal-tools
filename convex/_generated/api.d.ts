/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as _utils_albumEnrichmentAutoJudge from "../_utils/albumEnrichmentAutoJudge.js";
import type * as _utils_albumEnrichmentJudgeKinds from "../_utils/albumEnrichmentJudgeKinds.js";
import type * as _utils_albumEnrichmentSlices from "../_utils/albumEnrichmentSlices.js";
import type * as _utils_albumEnrichmentTrialValidators from "../_utils/albumEnrichmentTrialValidators.js";
import type * as _utils_albumLibraryIndexedList from "../_utils/albumLibraryIndexedList.js";
import type * as _utils_albumLibraryProjection from "../_utils/albumLibraryProjection.js";
import type * as _utils_albumLibraryRows from "../_utils/albumLibraryRows.js";
import type * as _utils_albumMatching from "../_utils/albumMatching.js";
import type * as _utils_albumMatchingCore from "../_utils/albumMatchingCore.js";
import type * as _utils_concertEventDedupe from "../_utils/concertEventDedupe.js";
import type * as _utils_forLaterAlbums from "../_utils/forLaterAlbums.js";
import type * as _utils_forLaterAlbumsUi from "../_utils/forLaterAlbumsUi.js";
import type * as _utils_forLaterDurationBuckets from "../_utils/forLaterDurationBuckets.js";
import type * as _utils_forLaterFilterProjection from "../_utils/forLaterFilterProjection.js";
import type * as _utils_forLaterProjectionPredicate from "../_utils/forLaterProjectionPredicate.js";
import type * as _utils_forLaterRecommendations from "../_utils/forLaterRecommendations.js";
import type * as _utils_geniusAlbumLyrics from "../_utils/geniusAlbumLyrics.js";
import type * as _utils_geniusCreditVisibility from "../_utils/geniusCreditVisibility.js";
import type * as _utils_geniusParser from "../_utils/geniusParser.js";
import type * as _utils_geniusSpotifyTrackDurations from "../_utils/geniusSpotifyTrackDurations.js";
import type * as _utils_google_rym_lucky_search from "../_utils/google_rym_lucky_search.js";
import type * as _utils_musicFunnelRepeats from "../_utils/musicFunnelRepeats.js";
import type * as _utils_playlistLyrics from "../_utils/playlistLyrics.js";
import type * as _utils_rateYourMusicTaxonomy from "../_utils/rateYourMusicTaxonomy.js";
import type * as _utils_robRankingArtistStats from "../_utils/robRankingArtistStats.js";
import type * as _utils_robRankingGenreStats from "../_utils/robRankingGenreStats.js";
import type * as _utils_rymGenreHierarchy from "../_utils/rymGenreHierarchy.js";
import type * as _utils_smartPlaylistAddedWindow from "../_utils/smartPlaylistAddedWindow.js";
import type * as _utils_smartPlaylistFilterModel from "../_utils/smartPlaylistFilterModel.js";
import type * as _utils_smartPlaylistGenreMatch from "../_utils/smartPlaylistGenreMatch.js";
import type * as _utils_smartPlaylistValidators from "../_utils/smartPlaylistValidators.js";
import type * as _utils_spotify_album_list from "../_utils/spotify_album_list.js";
import type * as _utils_ticketmasterConcerts from "../_utils/ticketmasterConcerts.js";
import type * as _utils_unmappedRymScrapes from "../_utils/unmappedRymScrapes.js";
import type * as _utils_upsertSpotifyAlbumRecord from "../_utils/upsertSpotifyAlbumRecord.js";
import type * as _utils_zineCoverTextLayout from "../_utils/zineCoverTextLayout.js";
import type * as _utils_zineInsideBackLayout from "../_utils/zineInsideBackLayout.js";
import type * as _utils_zineInsideBackSections from "../_utils/zineInsideBackSections.js";
import type * as albumEnrichment from "../albumEnrichment.js";
import type * as albumEnrichmentTrials from "../albumEnrichmentTrials.js";
import type * as articles from "../articles.js";
import type * as auth from "../auth.js";
import type * as birthdays from "../birthdays.js";
import type * as bookSearch from "../bookSearch.js";
import type * as concertActions from "../concertActions.js";
import type * as concerts from "../concerts.js";
import type * as folioSociety from "../folioSociety.js";
import type * as folioSocietyDetails from "../folioSocietyDetails.js";
import type * as folioSocietyImages from "../folioSocietyImages.js";
import type * as folioSocietyReleases from "../folioSocietyReleases.js";
import type * as forLaterAlbums from "../forLaterAlbums.js";
import type * as geniusAlbums from "../geniusAlbums.js";
import type * as geniusCreditLabels from "../geniusCreditLabels.js";
import type * as migrations_backfillCategorizedAt from "../migrations/backfillCategorizedAt.js";
import type * as migrations_backfillSpotifyAlbumId from "../migrations/backfillSpotifyAlbumId.js";
import type * as migrations_backfillUserTracks from "../migrations/backfillUserTracks.js";
import type * as migrations_importMusicFunnelFromProd from "../migrations/importMusicFunnelFromProd.js";
import type * as migrations_initializeRatingHistory from "../migrations/initializeRatingHistory.js";
import type * as migrations_migrateRatingsToThreeTier from "../migrations/migrateRatingsToThreeTier.js";
import type * as musicFunnel from "../musicFunnel.js";
import type * as playlistLyrics from "../playlistLyrics.js";
import type * as rateYourMusicScrapes from "../rateYourMusicScrapes.js";
import type * as robRankings from "../robRankings.js";
import type * as rooleases from "../rooleases.js";
import type * as rymGenreHierarchy from "../rymGenreHierarchy.js";
import type * as s3Helper from "../s3Helper.js";
import type * as smartPlaylists from "../smartPlaylists.js";
import type * as spotify from "../spotify.js";
import type * as spotifyListenRepair from "../spotifyListenRepair.js";
import type * as spotifyPlayEvents from "../spotifyPlayEvents.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  "_utils/albumEnrichmentAutoJudge": typeof _utils_albumEnrichmentAutoJudge;
  "_utils/albumEnrichmentJudgeKinds": typeof _utils_albumEnrichmentJudgeKinds;
  "_utils/albumEnrichmentSlices": typeof _utils_albumEnrichmentSlices;
  "_utils/albumEnrichmentTrialValidators": typeof _utils_albumEnrichmentTrialValidators;
  "_utils/albumLibraryIndexedList": typeof _utils_albumLibraryIndexedList;
  "_utils/albumLibraryProjection": typeof _utils_albumLibraryProjection;
  "_utils/albumLibraryRows": typeof _utils_albumLibraryRows;
  "_utils/albumMatching": typeof _utils_albumMatching;
  "_utils/albumMatchingCore": typeof _utils_albumMatchingCore;
  "_utils/concertEventDedupe": typeof _utils_concertEventDedupe;
  "_utils/forLaterAlbums": typeof _utils_forLaterAlbums;
  "_utils/forLaterAlbumsUi": typeof _utils_forLaterAlbumsUi;
  "_utils/forLaterDurationBuckets": typeof _utils_forLaterDurationBuckets;
  "_utils/forLaterFilterProjection": typeof _utils_forLaterFilterProjection;
  "_utils/forLaterProjectionPredicate": typeof _utils_forLaterProjectionPredicate;
  "_utils/forLaterRecommendations": typeof _utils_forLaterRecommendations;
  "_utils/geniusAlbumLyrics": typeof _utils_geniusAlbumLyrics;
  "_utils/geniusCreditVisibility": typeof _utils_geniusCreditVisibility;
  "_utils/geniusParser": typeof _utils_geniusParser;
  "_utils/geniusSpotifyTrackDurations": typeof _utils_geniusSpotifyTrackDurations;
  "_utils/google_rym_lucky_search": typeof _utils_google_rym_lucky_search;
  "_utils/musicFunnelRepeats": typeof _utils_musicFunnelRepeats;
  "_utils/playlistLyrics": typeof _utils_playlistLyrics;
  "_utils/rateYourMusicTaxonomy": typeof _utils_rateYourMusicTaxonomy;
  "_utils/robRankingArtistStats": typeof _utils_robRankingArtistStats;
  "_utils/robRankingGenreStats": typeof _utils_robRankingGenreStats;
  "_utils/rymGenreHierarchy": typeof _utils_rymGenreHierarchy;
  "_utils/smartPlaylistAddedWindow": typeof _utils_smartPlaylistAddedWindow;
  "_utils/smartPlaylistFilterModel": typeof _utils_smartPlaylistFilterModel;
  "_utils/smartPlaylistGenreMatch": typeof _utils_smartPlaylistGenreMatch;
  "_utils/smartPlaylistValidators": typeof _utils_smartPlaylistValidators;
  "_utils/spotify_album_list": typeof _utils_spotify_album_list;
  "_utils/ticketmasterConcerts": typeof _utils_ticketmasterConcerts;
  "_utils/unmappedRymScrapes": typeof _utils_unmappedRymScrapes;
  "_utils/upsertSpotifyAlbumRecord": typeof _utils_upsertSpotifyAlbumRecord;
  "_utils/zineCoverTextLayout": typeof _utils_zineCoverTextLayout;
  "_utils/zineInsideBackLayout": typeof _utils_zineInsideBackLayout;
  "_utils/zineInsideBackSections": typeof _utils_zineInsideBackSections;
  albumEnrichment: typeof albumEnrichment;
  albumEnrichmentTrials: typeof albumEnrichmentTrials;
  articles: typeof articles;
  auth: typeof auth;
  birthdays: typeof birthdays;
  bookSearch: typeof bookSearch;
  concertActions: typeof concertActions;
  concerts: typeof concerts;
  folioSociety: typeof folioSociety;
  folioSocietyDetails: typeof folioSocietyDetails;
  folioSocietyImages: typeof folioSocietyImages;
  folioSocietyReleases: typeof folioSocietyReleases;
  forLaterAlbums: typeof forLaterAlbums;
  geniusAlbums: typeof geniusAlbums;
  geniusCreditLabels: typeof geniusCreditLabels;
  "migrations/backfillCategorizedAt": typeof migrations_backfillCategorizedAt;
  "migrations/backfillSpotifyAlbumId": typeof migrations_backfillSpotifyAlbumId;
  "migrations/backfillUserTracks": typeof migrations_backfillUserTracks;
  "migrations/importMusicFunnelFromProd": typeof migrations_importMusicFunnelFromProd;
  "migrations/initializeRatingHistory": typeof migrations_initializeRatingHistory;
  "migrations/migrateRatingsToThreeTier": typeof migrations_migrateRatingsToThreeTier;
  musicFunnel: typeof musicFunnel;
  playlistLyrics: typeof playlistLyrics;
  rateYourMusicScrapes: typeof rateYourMusicScrapes;
  robRankings: typeof robRankings;
  rooleases: typeof rooleases;
  rymGenreHierarchy: typeof rymGenreHierarchy;
  s3Helper: typeof s3Helper;
  smartPlaylists: typeof smartPlaylists;
  spotify: typeof spotify;
  spotifyListenRepair: typeof spotifyListenRepair;
  spotifyPlayEvents: typeof spotifyPlayEvents;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
