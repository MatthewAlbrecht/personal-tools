import type { TrackItem } from "./types";

export type TrackGroup = {
	id: string;
	spotifyAlbumId?: string;
	albumName?: string;
	artistName: string;
	albumImageUrl?: string;
	tracks: TrackItem[];
	startTime: number;
	endTime: number;
};

/**
 * Get a key for grouping tracks by album.
 * Uses album name only - featured artists on tracks shouldn't break grouping.
 */
function getAlbumKey(track: TrackItem): string | null {
	if (!track.track.albumName) return null;
	// Normalize: lowercase, trim - just use album name
	// This handles cases where tracks have different featured artists
	return track.track.albumName.toLowerCase().trim();
}

/**
 * Groups consecutive tracks from the same album together.
 *
 * Algorithm:
 * 1. Walk through tracks (newest first)
 * 2. Group consecutive tracks with same album (by name only)
 * 3. Allow up to 1 foreign track without breaking the group
 * 4. Even just 2 tracks from the same album will be grouped
 */
export function groupTracksByAlbum(tracks: TrackItem[]): TrackGroup[] {
	if (tracks.length === 0) return [];

	const result: TrackGroup[] = [];

	// State for current album group being built
	let currentGroup: TrackGroup | null = null;
	let currentAlbumKey: string | null = null;
	let pendingTrack: TrackItem | null = null; // Single foreign track that might be absorbed
	let pendingAlbumKey: string | null = null;

	function flushPendingTrack() {
		if (pendingTrack) {
			result.push(createGroup(pendingTrack));
			pendingTrack = null;
			pendingAlbumKey = null;
		}
	}

	function flushCurrentGroup() {
		if (currentGroup && currentGroup.tracks.length > 0) {
			result.push(currentGroup);
		}
		currentGroup = null;
		currentAlbumKey = null;
	}

	for (const track of tracks) {
		const trackTime = track.lastPlayedAt ?? 0;
		const trackAlbumKey = getAlbumKey(track);

		// If no album key, treat as potential interleave or standalone
		if (!trackAlbumKey) {
			if (currentGroup && !pendingTrack) {
				// Hold as potential interleave
				pendingTrack = track;
				pendingAlbumKey = null;
				continue;
			}
			// No current group or already have pending - flush and emit
			flushCurrentGroup();
			flushPendingTrack();
			result.push(createGroup(track));
			continue;
		}

		// Check if track belongs to current group (same album)
		if (currentGroup && currentAlbumKey === trackAlbumKey) {
			// Same album - flush pending (it was interleaved) and add track
			flushPendingTrack();
			currentGroup.tracks.push(track);
			currentGroup.endTime = Math.min(currentGroup.endTime, trackTime);
			continue;
		}

		// Check if track matches the pending track's album (they could form a new group)
		if (pendingTrack && pendingAlbumKey && pendingAlbumKey === trackAlbumKey) {
			// The pending track and this track are from the same album!
			// Flush current group, start a new group with pending + this track
			flushCurrentGroup();
			currentGroup = {
				id: `group-${pendingTrack._id}`,
				spotifyAlbumId: pendingTrack.track.spotifyAlbumId,
				albumName: pendingTrack.track.albumName,
				artistName: pendingTrack.track.artistName,
				albumImageUrl: pendingTrack.track.albumImageUrl,
				tracks: [pendingTrack, track],
				startTime: pendingTrack.lastPlayedAt ?? 0,
				endTime: trackTime,
			};
			currentAlbumKey = pendingAlbumKey;
			pendingTrack = null;
			pendingAlbumKey = null;
			continue;
		}

		// Different album from both current group and pending
		if (currentGroup) {
			if (!pendingTrack) {
				// Hold this track as potential interleave
				pendingTrack = track;
				pendingAlbumKey = trackAlbumKey;
				continue;
			}
			// Already have a pending track - flush everything and start fresh
			flushCurrentGroup();
			flushPendingTrack();
		}

		// Start a new group
		currentGroup = {
			id: `group-${track._id}`,
			spotifyAlbumId: track.track.spotifyAlbumId,
			albumName: track.track.albumName,
			artistName: track.track.artistName,
			albumImageUrl: track.track.albumImageUrl,
			tracks: [track],
			startTime: trackTime,
			endTime: trackTime,
		};
		currentAlbumKey = trackAlbumKey;
	}

	// Flush remaining state
	flushCurrentGroup();
	flushPendingTrack();

	return result;
}

function createGroup(track: TrackItem): TrackGroup {
	return {
		id: `group-${track._id}`,
		spotifyAlbumId: track.track.spotifyAlbumId,
		albumName: track.track.albumName,
		artistName: track.track.artistName,
		albumImageUrl: track.track.albumImageUrl,
		tracks: [track],
		startTime: track.lastPlayedAt ?? 0,
		endTime: track.lastPlayedAt ?? 0,
	};
}
