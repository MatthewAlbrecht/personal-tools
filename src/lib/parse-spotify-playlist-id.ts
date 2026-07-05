/** Extract a Spotify playlist ID from a URL, URI, or plain ID string. */
export function parseSpotifyPlaylistId(input: string): string {
	const trimmed = input.trim();
	if (!trimmed) {
		return trimmed;
	}

	const urlMatch = trimmed.match(/playlist\/([a-zA-Z0-9]+)/);
	if (urlMatch?.[1]) {
		return urlMatch[1];
	}

	const uriMatch = trimmed.match(/spotify:playlist:([a-zA-Z0-9]+)/);
	if (uriMatch?.[1]) {
		return uriMatch[1];
	}

	return trimmed;
}
