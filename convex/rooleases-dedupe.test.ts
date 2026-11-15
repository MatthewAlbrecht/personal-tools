// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function setup() {
	const t = convexTest(schema, modules);
	const coachella = await t.run((ctx) =>
		ctx.db.insert("rooYears", {
			year: 2027,
			targetPlaylistId: "coachella",
			targetPlaylistName: "Coachella New Releases 2027",
			isDefault: true,
			createdAt: 0,
		}),
	);
	const bonnaroo = await t.run((ctx) =>
		ctx.db.insert("rooYears", {
			year: 2026,
			targetPlaylistId: "bonnaroo",
			targetPlaylistName: "Bonnaroo 2026 - New Releases",
			isDefault: false,
			createdAt: 0,
		}),
	);
	await t.mutation(api.rooleases.addTrackToYear, {
		yearId: coachella,
		spotifyTrackId: "single-version",
		spotifyArtistId: "jazzy",
		trackName: "Rocket Science",
		albumName: "Rocket Science",
		releaseDate: "2026-10-20",
	});
	return { t, coachella, bonnaroo };
}

test("a track with the same artist and exact name counts as already added for that year", async () => {
	const { t, coachella } = await setup();

	const added = await t.query(api.rooleases.isTrackAdded, {
		yearId: coachella,
		spotifyTrackId: "album-version",
		spotifyArtistId: "jazzy",
		trackName: "Rocket Science",
	});

	expect(added).toBe(true);
});

test("a different name or a different artist is still new", async () => {
	const { t, coachella } = await setup();

	const extendedMix = await t.query(api.rooleases.isTrackAdded, {
		yearId: coachella,
		spotifyTrackId: "extended",
		spotifyArtistId: "jazzy",
		trackName: "Rocket Science - Extended Mix",
	});
	const otherArtist = await t.query(api.rooleases.isTrackAdded, {
		yearId: coachella,
		spotifyTrackId: "cover",
		spotifyArtistId: "someone-else",
		trackName: "Rocket Science",
	});

	expect(extendedMix).toBe(false);
	expect(otherArtist).toBe(false);
});

test("a track added for one festival is still new for another festival", async () => {
	const { t, bonnaroo } = await setup();

	const added = await t.query(api.rooleases.isTrackAdded, {
		yearId: bonnaroo,
		spotifyTrackId: "single-version",
		spotifyArtistId: "jazzy",
		trackName: "Rocket Science",
	});

	expect(added).toBe(false);
});

test("addTrackToYear refuses a second track with the same artist and name in a year", async () => {
	const { t, coachella, bonnaroo } = await setup();

	const again = await t.mutation(api.rooleases.addTrackToYear, {
		yearId: coachella,
		spotifyTrackId: "album-version",
		spotifyArtistId: "jazzy",
		trackName: "Rocket Science",
		albumName: "Peace & Patience",
		releaseDate: "2026-11-01",
	});
	const otherFestival = await t.mutation(api.rooleases.addTrackToYear, {
		yearId: bonnaroo,
		spotifyTrackId: "single-version",
		spotifyArtistId: "jazzy",
		trackName: "Rocket Science",
		albumName: "Rocket Science",
		releaseDate: "2026-10-20",
	});

	expect(again).toEqual({ added: false, reason: "already_exists" });
	expect(otherFestival).toEqual({ added: true, reason: null });
});
