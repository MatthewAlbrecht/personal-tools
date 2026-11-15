import { expect, test } from "vitest";
import { keepFirstPerArtistAndName } from "./rooleases-dedupe";

test("keeps only the first track per artist and exact name", () => {
	const tracks = [
		{ trackId: "1", artistId: "jazzy", trackName: "Rocket Science" },
		{ trackId: "2", artistId: "jazzy", trackName: "Invisible" },
		{ trackId: "3", artistId: "jazzy", trackName: "Rocket Science" },
		{
			trackId: "4",
			artistId: "jazzy",
			trackName: "Rocket Science - Extended Mix",
		},
		{ trackId: "5", artistId: "kolter", trackName: "Rocket Science" },
		{ trackId: "6", artistId: "jazzy", trackName: "rocket science" },
	];

	expect(keepFirstPerArtistAndName(tracks).map((t) => t.trackId)).toEqual([
		"1",
		"2",
		"4",
		"5",
		"6",
	]);
});
