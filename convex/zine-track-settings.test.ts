// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("collapse repeats is saved per album track and cleared when turned off", async () => {
	const t = convexTest(schema, modules);
	const albumId = await t.mutation(api.geniusAlbums.createAlbum, {
		albumTitle: "Morir Saltando",
		artistName: "Hesse Kassel",
		albumSlug: "hesse-kassel-morir-saltando-english",
		geniusAlbumUrl: "https://genius.com/albums/Hesse-kassel/Morir-saltando",
		totalSongs: 2,
	});
	const pornomiseria = await t.mutation(api.geniusAlbums.createSong, {
		albumId,
		songTitle: "Pornomiseria",
		geniusSongUrl: "https://genius.com/Hesse-kassel-pornomiseria-lyrics",
		trackNumber: 1,
		lyrics: "We have to stop\nWe have to stop",
	});
	const relajar = await t.mutation(api.geniusAlbums.createSong, {
		albumId,
		songTitle: "No Me Puedo Relajar",
		geniusSongUrl: "https://genius.com/Hesse-kassel-no-me-puedo-relajar-lyrics",
		trackNumber: 2,
		lyrics: "I can't relax\nI can't relax",
	});

	await t.mutation(api.geniusAlbums.updateZineSongSettings, {
		songId: pornomiseria,
		zineCollapseRepeats: true,
	});

	const songs = () =>
		t.run(async (ctx) => ({
			pornomiseria: await ctx.db.get(pornomiseria),
			relajar: await ctx.db.get(relajar),
		}));

	let saved = await songs();
	expect(saved.pornomiseria?.zineCollapseRepeats).toBe(true);
	expect(saved.relajar?.zineCollapseRepeats).toBeUndefined();

	await t.mutation(api.geniusAlbums.updateZineSongSettings, {
		songId: pornomiseria,
		zineCollapseRepeats: false,
	});
	saved = await songs();
	expect(saved.pornomiseria?.zineCollapseRepeats).toBeUndefined();
});

test("second page is saved per album track and cleared when turned off", async () => {
	const t = convexTest(schema, modules);
	const albumId = await t.mutation(api.geniusAlbums.createAlbum, {
		albumTitle: "Morir Saltando",
		artistName: "Hesse Kassel",
		albumSlug: "hesse-kassel-morir-saltando-english",
		geniusAlbumUrl: "https://genius.com/albums/Hesse-kassel/Morir-saltando",
		totalSongs: 1,
	});
	const songId = await t.mutation(api.geniusAlbums.createSong, {
		albumId,
		songTitle: "Pornomiseria",
		geniusSongUrl: "https://genius.com/Hesse-kassel-pornomiseria-lyrics",
		trackNumber: 1,
		lyrics: "You can't pass there",
	});
	const read = () => t.run(async (ctx) => ctx.db.get(songId));

	await t.mutation(api.geniusAlbums.updateZineSongSettings, {
		songId,
		zineSecondPage: true,
	});
	expect((await read())?.zineSecondPage).toBe(true);

	await t.mutation(api.geniusAlbums.updateZineSongSettings, {
		songId,
		zineSecondPage: false,
	});
	expect((await read())?.zineSecondPage).toBeUndefined();
});
