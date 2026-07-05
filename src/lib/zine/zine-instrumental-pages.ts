import { hasRenderableLyrics } from "../../../convex/_utils/geniusAlbumLyrics";
import type { ZineSongPageData } from "./zine-pages";

export const ZINE_INSTRUMENTAL_GROUP_MAX = 6;

export type ZineCollapsedSongPage =
	| { kind: "song"; data: ZineSongPageData }
	| { kind: "instrumental-group"; songs: ZineSongPageData[] };

export function isInstrumentalOnlySong(
	song: Pick<ZineSongPageData, "lyrics">,
	options?: { showSectionLabels?: boolean },
): boolean {
	return !hasRenderableLyrics(song.lyrics, {
		showSectionLabels: options?.showSectionLabels ?? false,
	});
}

export function buildCollapsedSongPages(
	songPageDataList: ZineSongPageData[],
	options: {
		collapseInstrumentalTracks: boolean;
		showSectionLabels: boolean;
	},
): ZineCollapsedSongPage[] {
	if (!options.collapseInstrumentalTracks) {
		return songPageDataList.map((data) => ({ kind: "song", data }));
	}

	const result: ZineCollapsedSongPage[] = [];
	let buffer: ZineSongPageData[] = [];

	function flushBuffer(): void {
		if (buffer.length === 0) return;

		if (buffer.length === 1) {
			result.push({ kind: "song", data: buffer[0]! });
		} else {
			result.push({ kind: "instrumental-group", songs: [...buffer] });
		}

		buffer = [];
	}

	for (const data of songPageDataList) {
		if (
			isInstrumentalOnlySong(data, {
				showSectionLabels: options.showSectionLabels,
			})
		) {
			buffer.push(data);
			if (buffer.length >= ZINE_INSTRUMENTAL_GROUP_MAX) {
				result.push({ kind: "instrumental-group", songs: [...buffer] });
				buffer = [];
			}
			continue;
		}

		flushBuffer();
		result.push({ kind: "song", data });
	}

	flushBuffer();
	return result;
}
