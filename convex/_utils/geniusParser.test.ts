import assert from "node:assert/strict";
import test from "node:test";
import { HTMLElement } from "node-html-parser";
import { extractCredits } from "./geniusParser";

const creditsHtml = `
	<div data-testid="song-info-outer">
		<div data-testid="song-info">
			<div id="song-info"></div>
			<div class="SongInfo__Title">Credits</div>
			<div class="SongCredits__Columns">
				<div class="Credit__Container">
					<div class="Credit__Label">Released on</div>
					<div class="Credit__Contributor">October 6, 2014</div>
				</div>
				<div class="Credit__Container">
					<div class="Credit__Label">Producer</div>
					<div class="Credit__Contributor">
						<div><a href="https://genius.com/artists/Flying-lotus">Flying Lotus</a></div>
					</div>
				</div>
				<div class="Credit__Container">
					<div class="Credit__Label">Writers</div>
					<div class="Credit__Contributor">
						<div>
							<a href="/artists/Niki-randa">Niki Randa</a>
							&amp;
							<a href="https://genius.com/artists/Flying-lotus">Flying Lotus</a>
						</div>
					</div>
				</div>
				<div class="SongTags__Container">
					<div class="SongTags__Title">Tags</div>
					<div><a href="https://genius.com/tags/rock">Rock</a></div>
				</div>
			</div>
		</div>
	</div>
`;

test("extractCredits returns structured credits from Genius song info", () => {
	assert.deepEqual(extractCredits(creditsHtml), [
		{
			label: "Released on",
			contributors: [{ name: "October 6, 2014" }],
		},
		{
			label: "Producer",
			contributors: [
				{
					name: "Flying Lotus",
					url: "https://genius.com/artists/Flying-lotus",
				},
			],
		},
		{
			label: "Writers",
			contributors: [
				{
					name: "Niki Randa",
					url: "https://genius.com/artists/Niki-randa",
				},
				{
					name: "Flying Lotus",
					url: "https://genius.com/artists/Flying-lotus",
				},
			],
		},
	]);
});

test("extractCredits returns undefined when credits are absent", () => {
	assert.equal(
		extractCredits('<div data-testid="song-info"><div>Tags</div></div>'),
		undefined,
	);
});

test("extractCredits parses outer-only song info without credit classes", () => {
	const outerOnlyHtml = `
		<div data-testid="song-info-outer">
			<section>
				<h3>Credits</h3>
				<div>
					<span>Producer</span>
					<span><a href="/artists/Flying-lotus">Flying Lotus</a></span>
				</div>
				<div>
					<span>Released on</span>
					<span>October 6, 2014</span>
				</div>
				<div>
					<span>Tags</span>
					<span><a href="/tags/rock">Rock</a></span>
				</div>
			</section>
		</div>
	`;

	assert.deepEqual(extractCredits(outerOnlyHtml), [
		{
			label: "Producer",
			contributors: [
				{
					name: "Flying Lotus",
					url: "https://genius.com/artists/Flying-lotus",
				},
			],
		},
		{
			label: "Released on",
			contributors: [{ name: "October 6, 2014" }],
		},
	]);
});

test("extractCredits returns undefined when parsing throws unexpectedly", () => {
	const originalTextContent = Object.getOwnPropertyDescriptor(
		HTMLElement.prototype,
		"textContent",
	);

	Object.defineProperty(HTMLElement.prototype, "textContent", {
		get() {
			throw new Error("unexpected parser failure");
		},
		configurable: true,
	});

	try {
		assert.equal(
			extractCredits('<div data-testid="song-info"><div>Credits</div></div>'),
			undefined,
		);
	} finally {
		if (originalTextContent) {
			Object.defineProperty(
				HTMLElement.prototype,
				"textContent",
				originalTextContent,
			);
		}
	}
});
