import type { ClipboardEvent, FocusEvent } from "react";
import { parseSpotifyPlaylistId } from "~/lib/parse-spotify-playlist-id";

export function spotifyPlaylistIdInputProps(
	setValue: (value: string) => void,
): {
	onPaste: (event: ClipboardEvent<HTMLInputElement>) => void;
	onBlur: (event: FocusEvent<HTMLInputElement>) => void;
} {
	return {
		onPaste(event: ClipboardEvent<HTMLInputElement>) {
			event.preventDefault();
			setValue(parseSpotifyPlaylistId(event.clipboardData.getData("text")));
		},
		onBlur(event: FocusEvent<HTMLInputElement>) {
			setValue(parseSpotifyPlaylistId(event.target.value));
		},
	};
}
