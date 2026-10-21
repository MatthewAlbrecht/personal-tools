/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";

// Root-relative so keys stay consistent from this subdirectory.
const modules = import.meta.glob("/convex/**/*.ts");

function setup() {
	return convexTest(schema, modules);
}

const ashBlossom = {
	cardName: "Ash Blossom & Joyous Spring",
	section: "main" as const,
	copiesNeeded: 3,
	copiesOwned: 1,
	lowestAcceptableCondition: "lightlyPlayed" as const,
	candidates: [
		{
			setCode: "RA01-EN008",
			rarity: "Quarter Century Secret Rare",
			overloadedRarities: ["Super Rare", "Ultra Rare"],
		},
		{ setCode: "MP23-EN001", rarity: "Starlight Rare", overloadedRarities: [] },
	],
};

const snakeEyeAsh = {
	cardName: "Snake-Eye Ash",
	section: "main" as const,
	copiesNeeded: 2,
	candidates: [
		{ setCode: "AGOV-EN007", rarity: "Starlight Rare", overloadedRarities: [] },
	],
};

const calledByTheGrave = {
	cardName: "Called by the Grave",
	section: "side" as const,
	copiesNeeded: 1,
	candidates: [
		{
			setCode: "RA01-EN060",
			rarity: "Quarter Century Secret Rare",
			overloadedRarities: ["Super Rare", "Ultra Rare"],
		},
	],
};

const snakeEye = {
	name: "Snake-Eye",
	cards: [ashBlossom, snakeEyeAsh, calledByTheGrave],
};

async function deckNamed(t: ReturnType<typeof setup>, name: string) {
	const decks = await t.query(api.yugioh.decks.listDecks, {});
	const summary = decks.find((deck) => deck.name === name);
	if (!summary) throw new Error(`No Deck named ${name}`);
	const deck = await t.query(api.yugioh.decks.getDeck, { deckId: summary._id });
	if (!deck) throw new Error(`Deck ${name} disappeared`);
	return deck;
}

describe("loading a Deck", () => {
	test("creates the Deck with its Cards, Candidates, copies and Sections", async () => {
		const t = setup();

		await t.mutation(internal.yugioh.seed.loadDeck, snakeEye);

		const deck = await deckNamed(t, "Snake-Eye");
		expect(deck.copiesNeeded).toBe(6);
		expect(deck.copiesOwned).toBe(1);
		expect(deck.sections).toMatchObject([
			{
				section: "main",
				cards: [
					{
						cardName: "Ash Blossom & Joyous Spring",
						copiesNeeded: 3,
						copiesOwned: 1,
						lowestAcceptableCondition: "lightlyPlayed",
						chosenPrintingId: null,
						candidates: [
							{
								setCode: "RA01-EN008",
								rarity: "Quarter Century Secret Rare",
								overloadedRarities: ["Super Rare", "Ultra Rare"],
							},
							{ setCode: "MP23-EN001", rarity: "Starlight Rare" },
						],
					},
					{
						cardName: "Snake-Eye Ash",
						copiesNeeded: 2,
						copiesOwned: 0,
						lowestAcceptableCondition: "nearMint",
						candidates: [{ setCode: "AGOV-EN007", rarity: "Starlight Rare" }],
					},
				],
			},
			{
				section: "side",
				cards: [{ cardName: "Called by the Grave", copiesNeeded: 1 }],
			},
		]);
	});
});

describe("re-running the load", () => {
	test("the same list again changes nothing", async () => {
		const t = setup();
		await t.mutation(internal.yugioh.seed.loadDeck, snakeEye);
		const before = await deckNamed(t, "Snake-Eye");

		const report = await t.mutation(internal.yugioh.seed.loadDeck, snakeEye);

		expect(report).toMatchObject({
			deckId: before._id,
			deckCreated: false,
			cardsAdded: 0,
			cardsChanged: 0,
			candidatesAdded: 0,
			unlistedCards: [],
			unlistedCandidates: [],
		});
		expect(await t.query(api.yugioh.decks.listDecks, {})).toHaveLength(1);
		expect(await deckNamed(t, "Snake-Eye")).toEqual(before);
	});

	test("updates copies and condition, and adds new Cards and Candidates", async () => {
		const t = setup();
		await t.mutation(internal.yugioh.seed.loadDeck, snakeEye);

		const report = await t.mutation(internal.yugioh.seed.loadDeck, {
			name: "Snake-Eye",
			cards: [
				{
					...ashBlossom,
					copiesNeeded: 2,
					copiesOwned: 2,
					lowestAcceptableCondition: "nearMint",
				},
				{
					...snakeEyeAsh,
					candidates: [
						...snakeEyeAsh.candidates,
						{
							setCode: "RA02-EN010",
							rarity: "Quarter Century Secret Rare",
							overloadedRarities: [],
						},
					],
				},
				calledByTheGrave,
				{
					cardName: "Infinite Impermanence",
					section: "side",
					copiesNeeded: 2,
					candidates: [
						{
							setCode: "RA02-EN076",
							rarity: "Quarter Century Secret Rare",
							overloadedRarities: [],
						},
					],
				},
			],
		});

		expect(report).toMatchObject({
			deckCreated: false,
			cardsAdded: 1,
			cardsChanged: 1,
			candidatesAdded: 2,
		});
		const deck = await deckNamed(t, "Snake-Eye");
		expect(deck.sections).toMatchObject([
			{
				section: "main",
				cards: [
					{
						cardName: "Snake-Eye Ash",
						candidates: [{ setCode: "AGOV-EN007" }, { setCode: "RA02-EN010" }],
					},
					{
						cardName: "Ash Blossom & Joyous Spring",
						copiesNeeded: 2,
						copiesOwned: 2,
						lowestAcceptableCondition: "nearMint",
					},
				],
			},
			{
				section: "side",
				cards: [
					{ cardName: "Called by the Grave" },
					{ cardName: "Infinite Impermanence", copiesNeeded: 2 },
				],
			},
		]);
	});

	test("keeps Copies owned and condition set in the app when the list omits them", async () => {
		const t = setup();
		await t.mutation(internal.yugioh.seed.loadDeck, snakeEye);
		const ash = (await deckNamed(t, "Snake-Eye")).sections[0]?.cards.find(
			(card) => card.cardName === "Snake-Eye Ash",
		);
		if (!ash) throw new Error("Snake-Eye Ash missing");
		await t.mutation(api.yugioh.decks.updateCard, {
			deckCardId: ash._id,
			copiesOwned: 2,
			lowestAcceptableCondition: "moderatelyPlayed",
		});

		const report = await t.mutation(internal.yugioh.seed.loadDeck, snakeEye);

		expect(report.cardsChanged).toBe(0);
		const deck = await deckNamed(t, "Snake-Eye");
		expect(deck.sections[0]?.cards).toContainEqual(
			expect.objectContaining({
				cardName: "Snake-Eye Ash",
				copiesOwned: 2,
				lowestAcceptableCondition: "moderatelyPlayed",
			}),
		);
	});

	test("reports Cards and Candidates the list no longer has, and keeps them", async () => {
		const t = setup();
		await t.mutation(internal.yugioh.seed.loadDeck, snakeEye);

		const report = await t.mutation(internal.yugioh.seed.loadDeck, {
			name: "Snake-Eye",
			cards: [{ ...ashBlossom, candidates: ashBlossom.candidates.slice(0, 1) }],
		});

		expect(report.unlistedCards).toEqual([
			{ cardName: "Snake-Eye Ash", section: "main" },
			{ cardName: "Called by the Grave", section: "side" },
		]);
		expect(report.unlistedCandidates).toEqual([
			{
				cardName: "Ash Blossom & Joyous Spring",
				section: "main",
				setCode: "MP23-EN001",
				rarity: "Starlight Rare",
			},
		]);
		const deck = await deckNamed(t, "Snake-Eye");
		expect(deck.cardCount).toBe(3);
	});

	test("with removeUnlisted, the Deck ends up matching the list exactly", async () => {
		const t = setup();
		await t.mutation(internal.yugioh.seed.loadDeck, snakeEye);
		const ashRow = (await deckNamed(t, "Snake-Eye")).sections[0]?.cards[0];
		const starlight = ashRow?.candidates.find(
			(c) => c.setCode === "MP23-EN001",
		);
		if (!ashRow || !starlight) throw new Error("Ash Blossom missing");
		await t.mutation(api.yugioh.decks.choosePrinting, {
			deckCardId: ashRow._id,
			printingId: starlight.printingId,
		});

		const report = await t.mutation(internal.yugioh.seed.loadDeck, {
			name: "Snake-Eye",
			cards: [{ ...ashBlossom, candidates: ashBlossom.candidates.slice(0, 1) }],
			removeUnlisted: true,
		});

		expect(report).toMatchObject({
			cardsRemoved: 2,
			candidatesRemoved: 1,
			unlistedCards: [],
			unlistedCandidates: [],
		});
		const deck = await deckNamed(t, "Snake-Eye");
		expect(deck.sections).toMatchObject([
			{
				section: "main",
				cards: [
					{
						cardName: "Ash Blossom & Joyous Spring",
						chosenPrintingId: null,
						candidates: [{ setCode: "RA01-EN008" }],
					},
				],
			},
		]);
	});
});

describe("re-running with edits", () => {
	test("a Card that moved Section is moved, keeping what was set in the app", async () => {
		const t = setup();
		await t.mutation(internal.yugioh.seed.loadDeck, snakeEye);
		const grave = (await deckNamed(t, "Snake-Eye")).sections[1]?.cards[0];
		if (!grave) throw new Error("Called by the Grave missing");
		await t.mutation(api.yugioh.decks.updateCard, {
			deckCardId: grave._id,
			copiesOwned: 1,
		});

		const report = await t.mutation(internal.yugioh.seed.loadDeck, {
			name: "Snake-Eye",
			cards: [
				ashBlossom,
				snakeEyeAsh,
				{ ...calledByTheGrave, section: "main" },
			],
		});

		expect(report).toMatchObject({
			cardsAdded: 0,
			cardsChanged: 1,
			unlistedCards: [],
		});
		const deck = await deckNamed(t, "Snake-Eye");
		expect(deck.cardCount).toBe(3);
		expect(deck.sections.map((group) => group.section)).toEqual(["main"]);
		expect(deck.sections[0]?.cards).toContainEqual(
			expect.objectContaining({
				_id: grave._id,
				cardName: "Called by the Grave",
				copiesOwned: 1,
			}),
		);
	});

	test("lowering Copies needed lowers Copies owned with it", async () => {
		const t = setup();
		await t.mutation(internal.yugioh.seed.loadDeck, snakeEye);

		await t.mutation(internal.yugioh.seed.loadDeck, {
			name: "Snake-Eye",
			cards: [
				{ ...ashBlossom, copiesNeeded: 1, copiesOwned: undefined },
				snakeEyeAsh,
				calledByTheGrave,
			],
		});

		const deck = await deckNamed(t, "Snake-Eye");
		expect(deck.sections[0]?.cards).toContainEqual(
			expect.objectContaining({
				cardName: "Ash Blossom & Joyous Spring",
				copiesNeeded: 1,
				copiesOwned: 1,
			}),
		);
	});

	test("with removeUnlisted, a Card with 10 Candidates can swap them all", async () => {
		const t = setup();
		const tenPrintings = (prefix: string) =>
			Array.from({ length: 10 }, (_, index) => ({
				setCode: `${prefix}-EN${String(index).padStart(3, "0")}`,
				rarity: "Secret Rare",
				overloadedRarities: [],
			}));
		await t.mutation(internal.yugioh.seed.loadDeck, {
			name: "Snake-Eye",
			cards: [{ ...snakeEyeAsh, candidates: tenPrintings("AAAA") }],
		});

		const report = await t.mutation(internal.yugioh.seed.loadDeck, {
			name: "Snake-Eye",
			cards: [{ ...snakeEyeAsh, candidates: tenPrintings("BBBB") }],
			removeUnlisted: true,
		});

		expect(report).toMatchObject({
			candidatesAdded: 10,
			candidatesRemoved: 10,
		});
		const deck = await deckNamed(t, "Snake-Eye");
		const setCodes = deck.sections[0]?.cards[0]?.candidates.map(
			(candidate) => candidate.setCode,
		);
		expect(setCodes).toHaveLength(10);
		expect(setCodes?.every((code) => code.startsWith("BBBB"))).toBe(true);
	});

	test("new Printings take the saved Card's name, not the list's spelling", async () => {
		const t = setup();
		await t.mutation(internal.yugioh.seed.loadDeck, snakeEye);

		await t.mutation(internal.yugioh.seed.loadDeck, {
			name: "Snake-Eye",
			cards: [
				{
					...snakeEyeAsh,
					cardName: "snake-eye ash",
					candidates: [
						{
							setCode: "RA02-EN010",
							rarity: "Secret Rare",
							overloadedRarities: [],
						},
					],
				},
			],
		});

		// Saved as "Snake-Eye Ash", so this differently-spelled Card name is rejected.
		await expect(
			t.mutation(internal.yugioh.seed.loadDeck, {
				name: "Other",
				cards: [
					{
						...snakeEyeAsh,
						cardName: "Snake-Eye Oak",
						candidates: [
							{
								setCode: "RA02-EN010",
								rarity: "Secret Rare",
								overloadedRarities: [],
							},
						],
					},
				],
			}),
		).rejects.toThrow(/already saved as Snake-Eye Ash\./);
	});
});

describe("shared Printings", () => {
	test("a second Deck reuses the first Deck's Printings and adds Overloaded rarities", async () => {
		const t = setup();
		await t.mutation(internal.yugioh.seed.loadDeck, snakeEye);

		await t.mutation(internal.yugioh.seed.loadDeck, {
			name: "Fiendsmith",
			cards: [
				{
					cardName: "ash blossom & joyous spring",
					section: "main",
					copiesNeeded: 3,
					candidates: [
						{
							setCode: "ra01-en008",
							rarity: "quarter century secret rare",
							overloadedRarities: ["Secret Rare"],
						},
					],
				},
			],
		});

		const snake = await deckNamed(t, "Snake-Eye");
		const fiend = await deckNamed(t, "Fiendsmith");
		const snakeAsh = snake.sections[0]?.cards[0]?.candidates[0];
		const fiendAsh = fiend.sections[0]?.cards[0]?.candidates[0];
		expect(fiendAsh?.printingId).toBe(snakeAsh?.printingId);
		expect(snakeAsh?.overloadedRarities).toEqual(
			expect.arrayContaining(["Super Rare", "Ultra Rare", "Secret Rare"]),
		);
	});
});

describe("a list that can't load", () => {
	test("writes nothing when a set code + rarity is already saved as another Card", async () => {
		const t = setup();
		await t.mutation(internal.yugioh.seed.loadDeck, snakeEye);

		await expect(
			t.mutation(internal.yugioh.seed.loadDeck, {
				name: "Branded",
				cards: [
					{
						cardName: "Fallen of Albaz",
						section: "main",
						copiesNeeded: 3,
						candidates: [
							{
								setCode: "RA01-EN008",
								rarity: "Quarter Century Secret Rare",
								overloadedRarities: [],
							},
						],
					},
				],
			}),
		).rejects.toThrow(/already saved as Ash Blossom/);

		const decks = await t.query(api.yugioh.decks.listDecks, {});
		expect(decks.map((deck) => deck.name)).toEqual(["Snake-Eye"]);
	});

	test("rejects a Card listed twice in one Section", async () => {
		const t = setup();

		await expect(
			t.mutation(internal.yugioh.seed.loadDeck, {
				name: "Snake-Eye",
				cards: [snakeEyeAsh, { ...snakeEyeAsh, cardName: "snake-eye ash " }],
			}),
		).rejects.toThrow(/listed twice/);
		expect(await t.query(api.yugioh.decks.listDecks, {})).toEqual([]);
	});

	test("rejects a Card with no Candidate Printings", async () => {
		const t = setup();

		await expect(
			t.mutation(internal.yugioh.seed.loadDeck, {
				name: "Snake-Eye",
				cards: [{ ...snakeEyeAsh, candidates: [] }],
			}),
		).rejects.toThrow(/at least one Candidate/);
	});

	test("rejects copies outside the game's limits", async () => {
		const t = setup();

		await expect(
			t.mutation(internal.yugioh.seed.loadDeck, {
				name: "Snake-Eye",
				cards: [{ ...snakeEyeAsh, copiesNeeded: 4 }],
			}),
		).rejects.toThrow(/Copies needed/);
		expect(await t.query(api.yugioh.decks.listDecks, {})).toEqual([]);
	});
});

describe("the load is not public", () => {
	test("loadDeck is registered as internal", async () => {
		const { loadDeck } = await import("./seed");
		expect((loadDeck as { isInternal?: boolean }).isInternal).toBe(true);
		expect((loadDeck as { isPublic?: boolean }).isPublic).not.toBe(true);
	});
});
