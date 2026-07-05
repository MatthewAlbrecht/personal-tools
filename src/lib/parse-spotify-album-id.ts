/** Extract a Spotify album ID from a URL, URI, or plain ID string. */
export function parseSpotifyAlbumId(input: string): string {
	const trimmed = input.trim();
	if (!trimmed) {
		return trimmed;
	}

	const urlMatch = trimmed.match(/album\/([a-zA-Z0-9]+)/);
	if (urlMatch?.[1]) {
		return urlMatch[1];
	}

	const uriMatch = trimmed.match(/spotify:album:([a-zA-Z0-9]+)/);
	if (uriMatch?.[1]) {
		return uriMatch[1];
	}

	return trimmed;
}
