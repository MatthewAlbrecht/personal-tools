import { hasRenderableLyrics } from "../../../convex/_utils/geniusAlbumLyrics";
import type { ZineSongPageData } from "./zine-pages";

export const ZINE_INSTRUMENTAL_GROUP_MAX = 6;

export type ZineCollapsedSongPage =
	| { kind: "song"; data: ZineSongPageData }
	| { kind: "instrumental-group"; songs: ZineSongPageData[] }
	| { kind: "song-group"; songs: ZineSongPageData[] };

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
	// Phase 1: merge tracks the user manually chained via `collapseWithPrevious`
	// into shared units. A unit is one or more consecutive tracks on one page.
	const units: ZineSongPageData[][] = [];
	for (const data of songPageDataList) {
		const previousUnit = units[units.length - 1];
		if (previousUnit && data.collapseWithPrevious) {
			previousUnit.push(data);
		} else {
			units.push([data]);
		}
	}

	// Phase 2: emit pages, applying automatic instrumental grouping across the
	// remaining single-track units (manual chains are always kept intact).
	const isInstrumental = (song: ZineSongPageData) =>
		isInstrumentalOnlySong(song, {
			showSectionLabels: options.showSectionLabels,
		});

	const result: ZineCollapsedSongPage[] = [];
	let buffer: ZineSongPageData[] = [];

	function flushBuffer(): void {
		if (buffer.length === 0) return;

		const first = buffer[0];
		if (first === undefined) return;

		if (buffer.length === 1) {
			result.push({ kind: "song", data: first });
		} else {
			result.push({ kind: "instrumental-group", songs: [...buffer] });
		}

		buffer = [];
	}

	for (const unit of units) {
		const isSingle = unit.length === 1;
		const firstInUnit = unit[0];

		if (
			isSingle &&
			firstInUnit !== undefined &&
			options.collapseInstrumentalTracks &&
			isInstrumental(firstInUnit)
		) {
			buffer.push(firstInUnit);
			if (buffer.length >= ZINE_INSTRUMENTAL_GROUP_MAX) {
				result.push({ kind: "instrumental-group", songs: [...buffer] });
				buffer = [];
			}
			continue;
		}

		flushBuffer();

		if (isSingle && firstInUnit !== undefined) {
			result.push({ kind: "song", data: firstInUnit });
			continue;
		}

		// Manual chain: render as a compact instrumental group when every track is
		// instrumental, otherwise as a lyrics-bearing song group.
		result.push(
			unit.every(isInstrumental)
				? { kind: "instrumental-group", songs: unit }
				: { kind: "song-group", songs: unit },
		);
	}

	flushBuffer();
	return result;
}
