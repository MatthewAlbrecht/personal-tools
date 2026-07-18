/**
 * Mirrors `src/lib/album-enrichment/auto-judge.ts`. Convex cannot import
 * from `src/lib`, so this logic is duplicated here — keep both in sync.
 */

export type AutoJudgeCheck = {
	id: string;
	passed: boolean;
	note: string;
};

export type AutoJudgeResult = {
	passed: boolean;
	checks: AutoJudgeCheck[];
	notes: string;
};

/** Generic filler labels that carry no descriptive signal about the artwork. */
const GENERIC_COVER_NOISE_LABELS = new Set([
	"album cover",
	"cd cover",
	"cover art",
	"cover image",
	"artwork",
	"image",
	"photo",
	"picture",
]);

/**
 * RYM musical-genre words that must never bleed into cover descriptors —
 * these belong to `rateYourMusicGenres` / for-later "descriptors", not
 * artwork tags. Heuristic v1 blocklist, not exhaustive.
 */
const RYM_GENRE_BLEED_WORDS = new Set([
	"rock",
	"pop",
	"jazz",
	"hip hop",
	"hip-hop",
	"hiphop",
	"rap",
	"metal",
	"folk",
	"country",
	"electronic",
	"edm",
	"techno",
	"house",
	"ambient",
	"classical",
	"blues",
	"soul",
	"funk",
	"disco",
	"punk",
	"indie",
	"alternative",
	"r&b",
	"rnb",
	"k-pop",
	"kpop",
	"reggae",
	"ska",
	"grunge",
	"shoegaze",
	"dream pop",
	"synthpop",
	"singer-songwriter",
]);

function normalizeLabel(label: string): string {
	return label.trim().toLowerCase();
}

function buildResult(checks: AutoJudgeCheck[]): AutoJudgeResult {
	const passed = checks.every((check) => check.passed);
	const notes = checks
		.filter((check) => !check.passed)
		.map((check) => check.note)
		.join(" ");
	return { passed, checks, notes };
}

export function autoJudgeCoverDescriptors(payload: {
	tags: Array<{ label: string }>;
}): AutoJudgeResult {
	const labels = payload.tags.map((tag) => normalizeLabel(tag.label));

	const hasTagsCheck: AutoJudgeCheck = {
		id: "has-tags",
		passed: labels.length > 0,
		note:
			labels.length > 0
				? "Has at least one tag."
				: "No cover descriptor tags provided.",
	};

	const genericLabels = labels.filter((label) =>
		GENERIC_COVER_NOISE_LABELS.has(label),
	);
	const noGenericNoiseCheck: AutoJudgeCheck = {
		id: "no-generic-noise",
		passed: genericLabels.length === 0,
		note:
			genericLabels.length === 0
				? "No generic filler tags."
				: `Generic filler tags found: ${genericLabels.join(", ")}.`,
	};

	const bleedLabels = labels.filter((label) =>
		RYM_GENRE_BLEED_WORDS.has(label),
	);
	const noGenreBleedCheck: AutoJudgeCheck = {
		id: "no-genre-bleed",
		passed: bleedLabels.length === 0,
		note:
			bleedLabels.length === 0
				? "No RYM-musical genre bleed."
				: `RYM-musical genre words found: ${bleedLabels.join(", ")}.`,
	};

	return buildResult([hasTagsCheck, noGenericNoiseCheck, noGenreBleedCheck]);
}

const ACTIVE_SINCE_SHAPE = /^\d{4}(\s*[-–]\s*(\d{4}|present))?$/i;
const INSTAGRAM_URL_SHAPE =
	/^https:\/\/(www\.)?instagram\.com\/[a-z0-9._]+\/?$/i;

function isPlausibleYear(year: number): boolean {
	const currentYear = new Date().getFullYear();
	return year >= 1900 && year <= currentYear + 1;
}

export function autoJudgeArtistContext(payload: {
	origin?: string;
	activeSince?: string;
	instagramUrl?: string;
}): AutoJudgeResult {
	const origin = payload.origin?.trim() ?? "";
	const originCheck: AutoJudgeCheck = {
		id: "origin-present",
		passed: origin.length > 0,
		note: origin.length > 0 ? "Origin present." : "Origin is missing.",
	};

	const activeSince = payload.activeSince?.trim() ?? "";
	const activeSinceYears = activeSince.match(/\d{4}/g)?.map(Number) ?? [];
	const activeSincePassed =
		activeSince.length > 0 &&
		ACTIVE_SINCE_SHAPE.test(activeSince) &&
		activeSinceYears.every(isPlausibleYear);
	const activeSinceCheck: AutoJudgeCheck = {
		id: "active-since-shape",
		passed: activeSincePassed,
		note: activeSincePassed
			? "Active-since shape looks plausible."
			: `Active-since "${activeSince || "(missing)"}" is not a plausible year or year range.`,
	};

	const instagramUrl = payload.instagramUrl?.trim() ?? "";
	const instagramCheck: AutoJudgeCheck =
		instagramUrl.length === 0
			? {
					id: "instagram-url-shape",
					passed: true,
					note: "No Instagram URL provided.",
				}
			: {
					id: "instagram-url-shape",
					passed: INSTAGRAM_URL_SHAPE.test(instagramUrl),
					note: INSTAGRAM_URL_SHAPE.test(instagramUrl)
						? "Instagram URL shape looks valid."
						: `Instagram URL "${instagramUrl}" does not look like a valid instagram.com profile URL.`,
				};

	return buildResult([originCheck, activeSinceCheck, instagramCheck]);
}
