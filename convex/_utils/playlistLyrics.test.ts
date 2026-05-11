import assert from "node:assert/strict";
import test from "node:test";
import {
	buildGeniusSongScrape,
	buildPlaylistSongDisplay,
	getPlaylistSongAlbumArtUrl,
	isDuplicatePlaylistSongError,
	isPublicPlaylistStatus,
	normalizeGeniusSongUrl,
	shouldRefreshScrapeBeforePlaylistReuse,
	sortPlaylistItems,
} from "./playlistLyrics";

test("normalizeGeniusSongUrl strips query string and hash", () => {
	const result = normalizeGeniusSongUrl(
		"https://genius.com/Kendrick-lamar-squabble-up-lyrics?utm_source=test#annotations",
	);

	assert.equal(result, "https://genius.com/Kendrick-lamar-squabble-up-lyrics");
});

test("normalizeGeniusSongUrl accepts www.genius.com and returns genius.com", () => {
	const result = normalizeGeniusSongUrl(
		"https://www.genius.com/Charli-xcx-360-lyrics/",
	);

	assert.equal(result, "https://genius.com/Charli-xcx-360-lyrics");
});

test("normalizeGeniusSongUrl rejects non-Genius URLs", () => {
	assert.throws(
		() => normalizeGeniusSongUrl("https://example.com/Song-lyrics"),
		/URL must be from genius.com/,
	);
});

test("normalizeGeniusSongUrl rejects Genius non-lyrics pages", () => {
	assert.throws(
		() => normalizeGeniusSongUrl("https://genius.com/albums/Charli-xcx/Brat"),
		/URL must be a Genius song lyrics page/,
	);
});

test("buildPlaylistSongDisplay uses overrides without mutating scrape defaults", () => {
	const scrape = {
		songTitle: "Default Title",
		artistName: "Default Artist",
		albumTitle: "Default Album",
	};
	const item = {
		songTitleOverride: "Override Title",
		artistNameOverride: "Override Artist",
		albumTitleOverride: "Override Album",
	};

	const result = buildPlaylistSongDisplay({ scrape, item });

	assert.deepEqual(result, {
		songTitle: "Override Title",
		artistName: "Override Artist",
		albumTitle: "Override Album",
		albumYear: "",
	});
	assert.deepEqual(scrape, {
		songTitle: "Default Title",
		artistName: "Default Artist",
		albumTitle: "Default Album",
	});
});

test("getPlaylistSongAlbumArtUrl prefers item override over scraped artwork", () => {
	const result = getPlaylistSongAlbumArtUrl({
		scrape: {
			albumArtUrl: "https://images.genius.com/scraped.jpg",
		},
		item: {
			albumArtUrlOverride: "https://example.com/override.jpg",
		},
	});

	assert.equal(result, "https://example.com/override.jpg");
});

test("shouldRefreshScrapeBeforePlaylistReuse refreshes cached scrapes without album art", () => {
	assert.equal(
		shouldRefreshScrapeBeforePlaylistReuse({
			albumArtUrl: undefined,
		}),
		true,
	);
	assert.equal(
		shouldRefreshScrapeBeforePlaylistReuse({
			albumArtUrl: "https://images.genius.com/scraped.jpg",
		}),
		false,
	);
});

test("sortPlaylistItems orders by position ascending", () => {
	const items = [
		{ id: "third", position: 30 },
		{ id: "first", position: 10 },
		{ id: "second", position: 20 },
	];

	const result = sortPlaylistItems(items);

	assert.deepEqual(
		result.map((item) => item.id),
		["first", "second", "third"],
	);
});

test("isPublicPlaylistStatus only allows ready playlists", () => {
	assert.equal(isPublicPlaylistStatus("ready"), true);
	assert.equal(isPublicPlaylistStatus("draft"), false);
});

test("buildGeniusSongScrape extracts ready scrape input from Genius HTML", () => {
	const html = `
		<h1 class="SongHeader__Title"><span>Von dutch</span></h1>
		<h2 class="SongHeader__Title">
			<div class="HoverMarquee"><span>Charli xcx</span></div>
		</h2>
		<a class="PrimaryAlbum__Title" href="/albums/Charli-xcx/Brat">BRAT</a>
		<div data-lyrics-container="true">It's okay to just admit that you're jealous of me<br />Yeah, I heard you talk about me</div>
		<div class="SongDescription__Content"><p>A lead single from BRAT.</p></div>
	`;

	const result = buildGeniusSongScrape({
		canonicalUrl: "https://genius.com/Charli-xcx-von-dutch-lyrics",
		html,
	});

	assert.deepEqual(result, {
		canonicalUrl: "https://genius.com/Charli-xcx-von-dutch-lyrics",
		songTitle: "Von dutch",
		artistName: "Charli xcx",
		albumTitle: "BRAT",
		albumYear: undefined,
		lyrics:
			"It's okay to just admit that you're jealous of me\nYeah, I heard you talk about me",
		about: "A lead single from BRAT.",
	});
});

test("buildGeniusSongScrape extracts album art from the Genius cover art block", () => {
	const html = `
		<h1 class="SongHeader__Title"><span>Pink Moon</span></h1>
		<h2 class="SongHeader__Title">
			<div class="HoverMarquee"><span>Nick Drake</span></div>
		</h2>
		<a class="PrimaryAlbum__Title" href="/albums/Nick-drake/Pink-moon">Pink Moon</a>
		<a class="SongHeader-desktop__CoverArt-sc-cb565fd5-8 kHXMtw" href="/albums/Nick-drake/Pink-moon">
			<img src="https://images.genius.com/pink-moon.jpg" alt="Pink Moon album art" />
		</a>
		<div data-lyrics-container="true">Saw it written and I saw it say</div>
	`;

	const result = buildGeniusSongScrape({
		canonicalUrl: "https://genius.com/Nick-drake-pink-moon-lyrics",
		html,
	});

	assert.equal(result.albumArtUrl, "https://images.genius.com/pink-moon.jpg");
});

test("buildGeniusSongScrape falls back to data-src for lazy cover art images", () => {
	const html = `
		<h1 class="SongHeader__Title"><span>Big Time</span></h1>
		<h2 class="SongHeader__Title">
			<div class="HoverMarquee"><span>Angel Olsen</span></div>
		</h2>
		<a class="PrimaryAlbum__Title" href="/albums/Angel-olsen/Big-time">Big Time</a>
		<a class="SongHeader-desktop__CoverArt-sc-cb565fd5-8 kHXMtw" href="/albums/Angel-olsen/Big-time">
			<img src="" data-src="https://images.genius.com/big-time.jpg" alt="Big Time album art" />
		</a>
		<div data-lyrics-container="true">Good morning kisses giving you all mine</div>
	`;

	const result = buildGeniusSongScrape({
		canonicalUrl: "https://genius.com/Angel-olsen-big-time-lyrics",
		html,
	});

	assert.equal(result.albumArtUrl, "https://images.genius.com/big-time.jpg");
});

test("buildGeniusSongScrape extracts direct album art from real Genius proxy markup", () => {
	const html = `
		<h1 class="SongHeader__Title"><span>For Want Of</span></h1>
		<h2 class="SongHeader__Title">
			<div class="HoverMarquee"><span>Rites Of Spring</span></div>
		</h2>
		<a class="PrimaryAlbum__Title" href="/albums/Rites-of-spring/Rites-of-spring">Rites of Spring</a>
		<div class="SongHeader-desktop__CoverArt-sc-cb565fd5-8 kHXMtw"><img alt="Cover art for For Want Of by Rites Of Spring" class="SizedImage__Image-sc-1c7d8bda-1 kBSoCx SongHeader-desktop__SizedImage-sc-cb565fd5-15 dkyPVu" src="https://t2.genius.com/unsafe/689x689/https%3A%2F%2Fimages.genius.com%2F698d9f350b778224a19414bc84e52c53.600x600x1.jpg" data-visible="true"></div>
		<div data-lyrics-container="true">I woke up this morning with a piece of past caught in my throat</div>
	`;

	const result = buildGeniusSongScrape({
		canonicalUrl: "https://genius.com/Rites-of-spring-for-want-of-lyrics",
		html,
	});

	assert.equal(
		result.albumArtUrl,
		"https://images.genius.com/698d9f350b778224a19414bc84e52c53.600x600x1.jpg",
	);
});

test("buildGeniusSongScrape extracts album year from parenthetical album title", () => {
	const html = `
		<h1 class="SongHeader__Title"><span>End on End</span></h1>
		<h2 class="SongHeader__Title">
			<div class="HoverMarquee"><span>Rites of Spring</span></div>
		</h2>
		<a class="PrimaryAlbum__Title" href="/albums/Rites-of-spring/End-on-end">End on End (1991)</a>
		<div data-lyrics-container="true">I read somewhere that every wall's a door</div>
	`;

	const result = buildGeniusSongScrape({
		canonicalUrl: "https://genius.com/Rites-of-spring-end-on-end-lyrics",
		html,
	});

	assert.equal(result.albumTitle, "End on End");
	assert.equal(result.albumYear, "1991");
});

test("buildGeniusSongScrape removes non-year parentheticals from album title", () => {
	const html = `
		<h1 class="SongHeader__Title"><span>Album Track</span></h1>
		<h2 class="SongHeader__Title">
			<div class="HoverMarquee"><span>Album Artist</span></div>
		</h2>
		<a class="PrimaryAlbum__Title" href="/albums/Album-artist/Album-name">Album Name (Deluxe edition)</a>
		<div data-lyrics-container="true">A lyric line</div>
	`;

	const result = buildGeniusSongScrape({
		canonicalUrl: "https://genius.com/Album-artist-album-track-lyrics",
		html,
	});

	assert.equal(result.albumTitle, "Album Name");
	assert.equal(result.albumYear, undefined);
});

test("buildGeniusSongScrape decodes Genius lyric entities and removes contributor headers", () => {
	const html = `
		<h1 class="SongHeader__Title"><span>Kiss the Bottle</span></h1>
		<h2 class="SongHeader__Title">
			<div class="HoverMarquee"><span>Jawbreaker</span></div>
		</h2>
		<a class="PrimaryAlbum__Title" href="/albums/Jawbreaker/Etc">Etc.</a>
		<div data-lyrics-container="true">7 ContributorsKiss the Bottle Lyrics<br />Say mister, can you spare a dime?<br />It&#x27;s all I&#x27;ve got<br />Don&#x27;t call it sunburn</div>
	`;

	const result = buildGeniusSongScrape({
		canonicalUrl: "https://genius.com/Jawbreaker-kiss-the-bottle-lyrics",
		html,
	});

	assert.equal(
		result.lyrics,
		"Say mister, can you spare a dime?\nIt's all I've got\nDon't call it sunburn",
	);
	assert.equal(result.lyrics.includes("Contributors"), false);
	assert.equal(result.lyrics.includes("&#x27;"), false);
});

test("buildGeniusSongScrape rejects pages without required song data", () => {
	assert.throws(
		() =>
			buildGeniusSongScrape({
				canonicalUrl: "https://genius.com/Charli-xcx-von-dutch-lyrics",
				html: "<html></html>",
			}),
		/Could not extract song metadata and lyrics from Genius/,
	);
});

test("isDuplicatePlaylistSongError identifies duplicate playlist errors", () => {
	assert.equal(
		isDuplicatePlaylistSongError(new Error("Song is already in this playlist")),
		true,
	);
	assert.equal(isDuplicatePlaylistSongError(new Error("Fetch failed")), false);
});
