import assert from "node:assert/strict";
import test from "node:test";
import {
	buildChildKeysByParentKey,
	buildParentKeysByChildKey,
	collectDescendantGenreKeys,
	expandGenreKeysWithAncestorKeys,
	flattenRymGenreHierarchy,
	parseRymGenreHierarchyHtml,
	resolveTopLevelGenreKey,
	resolveTopLevelGenreKeys,
} from "./rymGenreHierarchy";

const SAMPLE_HTML = `
<ul class="page_genre_index_hierarchy">
	<li class="page_genre_index_hierarchy_item anchor expanded">
		<div class="page_genre_index_hierarchy_item_main">
			<div class="page_genre_index_hierarchy_item_main_inner">
				<h2><a href="/genre/blues/">Blues</a></h2>
				<p class="page_genre_index_hierarchy_item_description">Root blues description.</p>
			</div>
		</div>
		<div class="page_genre_index_hierarchy_item_expanded">
			<p class="page_genre_index_hierarchy_item_description_expanded">Expanded blues description.</p>
			<ul class="hierarchy_list">
				<li class="hierarchy_list_item">
					<div class="hierarchy_list_item_details">
						<a href="/genre/acoustic-blues/">Acoustic Blues</a>
						<p>Developed out of Work Song and Spiritual.</p>
					</div>
					<ul class="hierarchy_list">
						<li class="hierarchy_list_item">
							<div class="hierarchy_list_item_details">
								<a href="/genre/acoustic-texas-blues/">Acoustic Texas Blues</a>
								<p>Laid-back swing rhythms.</p>
							</div>
						</li>
					</ul>
				</li>
			</ul>
			<ul class="hierarchy_list">
				<li class="hierarchy_list_item">
					<div class="hierarchy_list_item_details">
						<a href="/genre/country-blues/">Country Blues</a>
						<p>Rural US South blues.</p>
					</div>
					<ul class="hierarchy_list">
						<li class="hierarchy_list_item">
							<div class="hierarchy_list_item_details">
								<a href="/genre/acoustic-texas-blues/">Acoustic Texas Blues</a>
								<p>Laid-back swing rhythms.</p>
							</div>
						</li>
					</ul>
				</li>
			</ul>
		</div>
	</li>
	<li class="page_genre_index_hierarchy_item anchor expanded">
		<div class="page_genre_index_hierarchy_item_main">
			<div class="page_genre_index_hierarchy_item_main_inner">
				<h2><a href="https://rateyourmusic.com/genre/ambient/">Ambient</a></h2>
				<p class="page_genre_index_hierarchy_item_description">Atmosphere and mood.</p>
			</div>
		</div>
		<div class="page_genre_index_hierarchy_item_expanded">
			<ul class="hierarchy_list">
				<li class="hierarchy_list_item">
					<div class="hierarchy_list_item_details">
						<a href="/genre/dark-ambient/">Dark Ambient</a>
						<p>Ominous atmosphere.</p>
					</div>
				</li>
			</ul>
		</div>
	</li>
</ul>
<h3>Uncategorized</h3>
<div class="page_genre_index_hierarchy_uncategorized">
	<li class="page_genre_index_hierarchy_item parentless_non_top_level anchor">
		<div class="page_genre_index_hierarchy_item_main">
			<div class="page_genre_index_hierarchy_item_main_inner">
				<h2><a href="/genre/asmr/">ASMR</a></h2>
				<p class="page_genre_index_hierarchy_item_description">Recordings intended to induce tingles.</p>
			</div>
		</div>
		<div class="page_genre_index_hierarchy_item_expanded">
			<p class="page_genre_index_hierarchy_item_description_expanded">Recordings intended to induce tingles.</p>
		</div>
	</li>
</div>
`;

test("parseRymGenreHierarchyHtml preserves top-level and nested genres", () => {
	const tree = parseRymGenreHierarchyHtml(SAMPLE_HTML);

	assert.equal(tree.length, 3);
	assert.equal(tree[0]?.key, "blues");
	assert.equal(tree[0]?.label, "Blues");
	assert.equal(tree[0]?.href, "/genre/blues/");
	assert.equal(tree[0]?.description, "Expanded blues description.");
	assert.equal(tree[0]?.isTopLevel, true);
	assert.equal(tree[0]?.children.length, 2);
	assert.equal(tree[0]?.children[0]?.key, "acoustic blues");
	assert.equal(tree[0]?.children[0]?.children[0]?.key, "acoustic texas blues");
	assert.equal(tree[1]?.href, "/genre/ambient/");
	assert.equal(tree[2]?.key, "asmr");
	assert.equal(tree[2]?.isTopLevel, false);
});

test("flattenRymGenreHierarchy dedupes genres but keeps multiple parent edges", () => {
	const flat = flattenRymGenreHierarchy(
		parseRymGenreHierarchyHtml(SAMPLE_HTML),
	);

	assert.deepEqual(flat.genres.map((genre) => genre.key).sort(), [
		"acoustic blues",
		"acoustic texas blues",
		"ambient",
		"asmr",
		"blues",
		"country blues",
		"dark ambient",
	]);

	assert.deepEqual(
		flat.relationships
			.map((relationship) => [
				relationship.parentKey,
				relationship.childKey,
				relationship.position,
			])
			.sort(),
		[
			["acoustic blues", "acoustic texas blues", 0],
			["ambient", "dark ambient", 0],
			["blues", "acoustic blues", 0],
			["blues", "country blues", 1],
			["country blues", "acoustic texas blues", 0],
		],
	);

	assert.equal(
		flat.genres.find((genre) => genre.key === "blues")?.isTopLevel,
		true,
	);
	assert.equal(
		flat.genres.find((genre) => genre.key === "acoustic blues")?.isTopLevel,
		false,
	);
	assert.equal(
		flat.genres.find((genre) => genre.key === "asmr")?.isTopLevel,
		false,
	);
});

test("expandGenreKeysWithAncestorKeys walks every parent branch", () => {
	const parentKeysByChild = buildParentKeysByChildKey([
		{ parentKey: "blues", childKey: "acoustic blues" },
		{ parentKey: "blues", childKey: "country blues" },
		{ parentKey: "acoustic blues", childKey: "acoustic texas blues" },
		{ parentKey: "country blues", childKey: "acoustic texas blues" },
	]);

	assert.deepEqual(
		expandGenreKeysWithAncestorKeys(
			["acoustic texas blues"],
			parentKeysByChild,
		),
		["acoustic blues", "acoustic texas blues", "blues", "country blues"],
	);
});

test("resolveTopLevelGenreKey walks parents to the nearest top-level genre", () => {
	const parentKeysByChild = buildParentKeysByChildKey([
		{ parentKey: "blues", childKey: "acoustic blues" },
		{ parentKey: "blues", childKey: "country blues" },
		{ parentKey: "acoustic blues", childKey: "acoustic texas blues" },
	]);
	const topLevelGenreKeys = new Set(["blues", "ambient"]);

	assert.equal(
		resolveTopLevelGenreKey(
			"acoustic texas blues",
			parentKeysByChild,
			topLevelGenreKeys,
		),
		"blues",
	);
	assert.equal(
		resolveTopLevelGenreKey("ambient", parentKeysByChild, topLevelGenreKeys),
		"ambient",
	);
});

test("resolveTopLevelGenreKeys returns every top-level ancestor for multi-parent genres", () => {
	const parentKeysByChild = buildParentKeysByChildKey([
		{ parentKey: "pop", childKey: "pop soul" },
		{ parentKey: "soul", childKey: "pop soul" },
		{ parentKey: "r&b", childKey: "soul" },
	]);
	const topLevelGenreKeys = new Set(["pop", "r&b"]);

	assert.deepEqual(
		resolveTopLevelGenreKeys("pop soul", parentKeysByChild, topLevelGenreKeys),
		["pop", "r&b"],
	);
});

test("collectDescendantGenreKeys includes nested subgenres", () => {
	const childKeysByParent = buildChildKeysByParentKey([
		{ parentKey: "blues", childKey: "acoustic blues" },
		{ parentKey: "blues", childKey: "country blues" },
		{ parentKey: "acoustic blues", childKey: "acoustic texas blues" },
	]);

	assert.deepEqual(
		[...collectDescendantGenreKeys("blues", childKeysByParent)].sort(),
		["acoustic blues", "acoustic texas blues", "blues", "country blues"],
	);
});
