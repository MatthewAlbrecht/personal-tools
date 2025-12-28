import type {
	RecentlyPlayedItem,
	SavedTrackItem,
	SpotifyPlaylist,
	SpotifyTrack,
} from "~/lib/spotify";

export type {
	SpotifyTrack,
	RecentlyPlayedItem,
	SpotifyPlaylist,
	SavedTrackItem,
};

export type PlaylistSuggestion = {
	playlistId: string;
	playlistName: string;
	confidence: "high" | "medium" | "low";
	reason: string;
};

export type CategorizationResponse = {
	suggestedPlaylists: PlaylistSuggestion[];
};

export type LocalPlaylist = {
	_id: string;
	userId: string;
	spotifyPlaylistId: string;
	name: string;
	description: string;
	userNotes?: string;
	imageUrl?: string;
	isActive: boolean;
	createdAt: number;
	updatedAt: number;
};

export type SongCategorization = {
	_id: string;
	userId: string;
	trackId: string;
	trackName: string;
	artistName: string;
	albumName?: string;
	albumImageUrl?: string;
	userInput: string;
	aiSuggestions: PlaylistSuggestion[];
	finalSelections: string[];
	createdAt: number;
};

export type ReviewState =
	| { status: "idle" }
	| { status: "input" }
	| { status: "loading" }
	| { status: "suggestions"; suggestions: PlaylistSuggestion[] }
	| { status: "saving" }
	| { status: "complete" };

export type PlayerState = {
	isReady: boolean;
	isPlaying: boolean;
	isPending: boolean;
	pendingTrackId: string | null;
	currentTrackId: string | null;
	position: number;
	duration: number;
	error: string | null;
};
