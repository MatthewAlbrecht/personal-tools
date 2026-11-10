// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("album zine display settings save and return collapseRepeats", async () => {
	const t = convexTest(schema, modules);
	const albumId = await t.mutation(api.geniusAlbums.createAlbum, {
		albumTitle: "Morir Saltando",
		artistName: "Hesse Kassel",
		albumSlug: "hesse-kassel-morir-saltando-english",
		geniusAlbumUrl: "https://genius.com/albums/Hesse-kassel/Morir-saltando",
		totalSongs: 0,
	});

	await t.mutation(api.geniusAlbums.updateZineDisplaySettings, {
		albumId,
		settings: {
			showArtist: true,
			showAlbum: true,
			showYear: true,
			showAlbumArt: true,
			showIntro: true,
			showGeniusInfo: false,
			showSectionLabels: false,
			collapseRepeats: true,
			showUserNote: true,
			separateInstrumentalPages: false,
			showCreditsRule: false,
			showRecommendationsLabel: true,
			showRecommendationsPadding: true,
		},
	});

	const album = await t.query(api.geniusAlbums.getAlbumBySlug, {
		slug: "hesse-kassel-morir-saltando-english",
	});
	expect(album?.album.zineDisplaySettings?.collapseRepeats).toBe(true);
});
