import assert from "node:assert/strict";
import test from "node:test";
import {
	filterListens,
	getWeekRangeKey,
	groupListensByMonth,
	groupListensByWeek,
	sectionStats,
} from "./album-listens-grouping";

test("getWeekRangeKey uses Monday–Sunday for Sep 10 2026", () => {
	const thu = new Date(2026, 8, 10, 15, 0, 0).getTime(); // Sep 10 2026 Thursday
	const { label } = getWeekRangeKey(thu);
	assert.match(label, /Sep 7/);
	assert.match(label, /13/);
});

test("groupListensByWeek newest first and drops nothing", () => {
	const items = [
		{ id: "a", listenedAt: new Date(2026, 8, 10).getTime() },
		{ id: "b", listenedAt: new Date(2026, 8, 1).getTime() },
	];
	const groups = groupListensByWeek(items);
	assert.equal(groups.length, 2);
	assert.ok(groups[0]?.items.some((i) => i.id === "a"));
});

test("sectionStats counts albums and new", () => {
	assert.deepEqual(
		sectionStats([
			{ isFirstListen: true },
			{ isFirstListen: false },
			{ isFirstListen: true },
		]),
		{ albumCount: 3, newCount: 2 },
	);
});

test("filterListens only first listens", () => {
	const rows = [
		{ id: "1", isFirstListen: true, albumId: "a", listenedAt: 1 },
		{ id: "2", isFirstListen: false, albumId: "a", listenedAt: 2 },
	];
	const filtered = filterListens(rows, {
		onlyUnranked: false,
		onlyFirstListens: true,
		ratedAlbumIds: new Set(),
	});
	assert.deepEqual(
		filtered.map((r) => r.id),
		["1"],
	);
});

test("filterListens release year range is inclusive", () => {
	const rows = [
		{
			id: "a",
			albumId: "1",
			listenedAt: 1,
			album: { releaseDate: "1969-01-01" },
		},
		{
			id: "b",
			albumId: "2",
			listenedAt: 2,
			album: { releaseDate: "1975-06-01" },
		},
		{
			id: "c",
			albumId: "3",
			listenedAt: 3,
			album: { releaseDate: "1981-01-01" },
		},
	];
	const filtered = filterListens(rows, {
		onlyUnranked: false,
		onlyFirstListens: false,
		yearMin: 1970,
		yearMax: 1979,
		ratedAlbumIds: new Set(),
	});
	assert.deepEqual(
		filtered.map((r) => r.id),
		["b"],
	);
});
