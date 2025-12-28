/**
 * Remove the "PT - " prefix from playlist names
 * @param playlistName The original playlist name
 * @returns The playlist name without the "PT - " prefix
 */
export function formatPlaylistName(playlistName: string): string {
	const PREFIX = "PT - ";
	return playlistName.startsWith(PREFIX)
		? playlistName.slice(PREFIX.length)
		: playlistName;
}
