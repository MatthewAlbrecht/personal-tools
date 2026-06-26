import type { Id } from "convex/_generated/dataModel";

export type RankingAlbum = {
	_id: Id<"robRankingAlbums">;
	albumId?: Id<"spotifyAlbums">;
	source: "spotify" | "manual";
	position: number;
	album: {
		name: string;
		artistName: string;
		imageUrl?: string;
		releaseDate?: string;
	} | null;
};

export type AvailableAlbum = {
	_id: Id<"spotifyAlbums">;
	spotifyAlbumId: string;
	name: string;
	artistName: string;
	imageUrl?: string;
	releaseDate?: string;
	totalTracks: number;
};

export type Bucket = {
	label: string;
	start: number;
	end: number;
};

export const BUCKETS: Bucket[] = [
	{ label: "1-10", start: 1, end: 10 },
	{ label: "11-20", start: 11, end: 20 },
	{ label: "21-30", start: 21, end: 30 },
	{ label: "31-40", start: 31, end: 40 },
	{ label: "41-50", start: 41, end: 50 },
];
