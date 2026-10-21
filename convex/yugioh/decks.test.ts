/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

// Root-relative so keys stay consistent from this subdirectory.
const modules = import.meta.glob("/convex/**/*.ts");

function setup() {
	return convexTest(schema, modules);
}

describe("Decks overview", () => {
	test("lists every Deck with Copies owned / needed", async () => {
		const t = setup();
		await t.mutation(api.yugioh.decks.createDeck, { name: "Snake-Eye" });

		const decks = await t.query(api.yugioh.decks.listDecks, {});

		expect(decks).toMatchObject([
			{ name: "Snake-Eye", copiesOwned: 0, copiesNeeded: 0, cardCount: 0 },
		]);
	});
});

const ashBlossom = {
	cardName: "Ash Blossom & Joyous Spring",
	setCode: "ra01-en008 ",
	rarity: "quarter century secret rare",
	overloadedRarities: ["Super Rare", "Ultra Rare", "Super Rare"],
	section: "main" as const,
	copiesNeeded: 3,
};

describe("adding a Card", () => {
	test("adds a Card with its first Candidate Printing to the Deck", async () => {
		const t = setup();
		const deckId = await t.mutation(api.yugioh.decks.createDeck, {
			name: "Snake-Eye",
		});

		await t.mutation(api.yugioh.decks.addCard, { deckId, ...ashBlossom });

		const deck = await t.query(api.yugioh.decks.getDeck, { deckId });
		expect(deck?.name).toBe("Snake-Eye");
		expect(deck?.copiesOwned).toBe(0);
		expect(deck?.copiesNeeded).toBe(3);
		expect(deck?.sections).toHaveLength(1);
		const [main] = deck?.sections ?? [];
		expect(main?.section).toBe("main");
		expect(main?.cards).toMatchObject([
			{
				cardName: "Ash Blossom & Joyous Spring",
				copiesNeeded: 3,
				copiesOwned: 0,
				lowestAcceptableCondition: "nearMint",
				chosenPrintingId: null,
				candidates: [
					{
						setCode: "RA01-EN008",
						rarity: "Quarter Century Secret Rare",
						overloadedRarities: ["Super Rare", "Ultra Rare"],
					},
				],
			},
		]);
	});

	test("the overview counts the new Card's Copies", async () => {
		const t = setup();
		const deckId = await t.mutation(api.yugioh.decks.createDeck, {
			name: "Snake-Eye",
		});
		await t.mutation(api.yugioh.decks.addCard, { deckId, ...ashBlossom });

		const decks = await t.query(api.yugioh.decks.listDecks, {});

		expect(decks).toMatchObject([
			{ name: "Snake-Eye", copiesOwned: 0, copiesNeeded: 3, cardCount: 1 },
		]);
	});

	test("rejects copies needed outside 1-3", async () => {
		const t = setup();
		const deckId = await t.mutation(api.yugioh.decks.createDeck, {
			name: "Snake-Eye",
		});

		await expect(
			t.mutation(api.yugioh.decks.addCard, {
				deckId,
				...ashBlossom,
				copiesNeeded: 4,
			}),
		).rejects.toThrow(/Copies needed/);
	});

	test("a missing Deck reads as null", async () => {
		const t = setup();
		const deckId = await t.mutation(api.yugioh.decks.createDeck, {
			name: "Gone",
		});
		await t.run(async (ctx) => ctx.db.delete("yugiohDecks", deckId));

		expect(await t.query(api.yugioh.decks.getDeck, { deckId })).toBeNull();
	});
});

async function deckWithCard(
	t: ReturnType<typeof setup>,
	name = "Snake-Eye",
	card = ashBlossom,
) {
	const deckId = await t.mutation(api.yugioh.decks.createDeck, { name });
	const deckCardId = await t.mutation(api.yugioh.decks.addCard, {
		deckId,
		...card,
	});
	return { deckId, deckCardId };
}

async function cardView(
	t: ReturnType<typeof setup>,
	deckId: Id<"yugiohDecks">,
) {
	const deck = await t.query(api.yugioh.decks.getDeck, { deckId });
	const card = deck?.sections.flatMap((s) => s.cards)[0];
	if (!card) throw new Error("expected a Card");
	return card;
}

describe("owning Copies", () => {
	test("the same Printing in two Decks is one Printing with separate ownership", async () => {
		const t = setup();
		const first = await deckWithCard(t, "Snake-Eye");
		const second = await deckWithCard(t, "Fire King", {
			...ashBlossom,
			setCode: "RA01-EN008",
			rarity: "Quarter Century Secret Rare",
			overloadedRarities: ["Secret Rare"],
		});

		await t.mutation(api.yugioh.decks.updateCard, {
			deckCardId: first.deckCardId,
			copiesOwned: 2,
		});

		const a = await cardView(t, first.deckId);
		const b = await cardView(t, second.deckId);
		expect(a.candidates[0]?.printingId).toBe(b.candidates[0]?.printingId);
		expect(a.copiesOwned).toBe(2);
		expect(b.copiesOwned).toBe(0);
		// Overloaded rarities learned from either Deck are merged on the Printing.
		expect(b.candidates[0]?.overloadedRarities).toEqual([
			"Super Rare",
			"Ultra Rare",
			"Secret Rare",
		]);
	});

	test("the overview counts owned Copies, never more than needed", async () => {
		const t = setup();
		const { deckId, deckCardId } = await deckWithCard(t);
		await t.mutation(api.yugioh.decks.addCard, {
			deckId,
			...ashBlossom,
			cardName: "Snake-Eye Ash",
			setCode: "ROTA-EN001",
			copiesNeeded: 2,
		});
		await t.mutation(api.yugioh.decks.updateCard, {
			deckCardId,
			copiesOwned: 3,
		});

		const [deck] = await t.query(api.yugioh.decks.listDecks, {});

		expect(deck).toMatchObject({ copiesOwned: 3, copiesNeeded: 5 });
	});

	test("owned Copies can't go above needed or below 0", async () => {
		const t = setup();
		const { deckCardId } = await deckWithCard(t);

		await expect(
			t.mutation(api.yugioh.decks.updateCard, { deckCardId, copiesOwned: 4 }),
		).rejects.toThrow(/Copies owned/);
		await expect(
			t.mutation(api.yugioh.decks.updateCard, { deckCardId, copiesOwned: -1 }),
		).rejects.toThrow(/Copies owned/);
	});

	test("lowering Copies needed below owned lowers owned with it", async () => {
		const t = setup();
		const { deckId, deckCardId } = await deckWithCard(t);
		await t.mutation(api.yugioh.decks.updateCard, {
			deckCardId,
			copiesOwned: 3,
		});

		await t.mutation(api.yugioh.decks.updateCard, {
			deckCardId,
			copiesNeeded: 2,
		});

		expect(await cardView(t, deckId)).toMatchObject({
			copiesNeeded: 2,
			copiesOwned: 2,
		});
	});

	test("Lowest acceptable condition and Section are editable", async () => {
		const t = setup();
		const { deckId, deckCardId } = await deckWithCard(t);

		await t.mutation(api.yugioh.decks.updateCard, {
			deckCardId,
			lowestAcceptableCondition: "lightlyPlayed",
			section: "side",
		});

		expect(await cardView(t, deckId)).toMatchObject({
			lowestAcceptableCondition: "lightlyPlayed",
			section: "side",
		});
	});
});

describe("priority", () => {
	test("a Card is Medium priority until set; High, Medium or Low can be set", async () => {
		const t = setup();
		const { deckId, deckCardId } = await deckWithCard(t);
		expect(await cardView(t, deckId)).toMatchObject({ priority: "medium" });

		await t.mutation(api.yugioh.decks.updateCard, {
			deckCardId,
			priority: "high",
		});
		expect(await cardView(t, deckId)).toMatchObject({ priority: "high" });

		await t.mutation(api.yugioh.decks.updateCard, {
			deckCardId,
			priority: "low",
		});
		expect(await cardView(t, deckId)).toMatchObject({ priority: "low" });
	});

	test("setting priority leaves the Card's Copies and condition alone", async () => {
		const t = setup();
		const { deckId, deckCardId } = await deckWithCard(t);
		await t.mutation(api.yugioh.decks.updateCard, {
			deckCardId,
			copiesOwned: 2,
			lowestAcceptableCondition: "lightlyPlayed",
		});

		await t.mutation(api.yugioh.decks.updateCard, {
			deckCardId,
			priority: "high",
		});

		expect(await cardView(t, deckId)).toMatchObject({
			priority: "high",
			copiesOwned: 2,
			copiesNeeded: 3,
			lowestAcceptableCondition: "lightlyPlayed",
		});
	});
});

const ashStarlight = {
	setCode: "MP23-EN001",
	rarity: "Starlight Rare",
	overloadedRarities: [],
};

describe("Candidate Printings", () => {
	test("adds another Candidate Printing to a Card", async () => {
		const t = setup();
		const { deckId, deckCardId } = await deckWithCard(t);

		await t.mutation(api.yugioh.decks.addCandidatePrinting, {
			deckCardId,
			...ashStarlight,
		});

		const card = await cardView(t, deckId);
		expect(card.candidates.map((c) => c.setCode)).toEqual([
			"RA01-EN008",
			"MP23-EN001",
		]);
		expect(card.chosenPrintingId).toBeNull();
	});

	test("won't add the same Printing twice to one Card", async () => {
		const t = setup();
		const { deckCardId } = await deckWithCard(t);

		await expect(
			t.mutation(api.yugioh.decks.addCandidatePrinting, {
				deckCardId,
				setCode: "RA01-EN008",
				rarity: "QCSR",
				overloadedRarities: [],
			}),
		).rejects.toThrow(/already a Candidate/);
	});

	test("choosing a Printing puts it first; switching back works", async () => {
		const t = setup();
		const { deckId, deckCardId } = await deckWithCard(t);
		await t.mutation(api.yugioh.decks.addCandidatePrinting, {
			deckCardId,
			...ashStarlight,
		});
		const [qcsr, starlight] = (await cardView(t, deckId)).candidates;
		if (!qcsr || !starlight) throw new Error("expected two Candidates");

		await t.mutation(api.yugioh.decks.choosePrinting, {
			deckCardId,
			printingId: starlight.printingId,
		});
		let card = await cardView(t, deckId);
		expect(card.chosenPrintingId).toBe(starlight.printingId);
		expect(card.candidates.map((c) => c.setCode)).toEqual([
			"MP23-EN001",
			"RA01-EN008",
		]);

		await t.mutation(api.yugioh.decks.choosePrinting, {
			deckCardId,
			printingId: qcsr.printingId,
		});
		card = await cardView(t, deckId);
		expect(card.chosenPrintingId).toBe(qcsr.printingId);
		expect(card.candidates).toHaveLength(2);

		await t.mutation(api.yugioh.decks.choosePrinting, {
			deckCardId,
			printingId: null,
		});
		expect((await cardView(t, deckId)).chosenPrintingId).toBeNull();
	});

	test("only a Candidate can be chosen", async () => {
		const t = setup();
		const { deckCardId } = await deckWithCard(t);
		const other = await deckWithCard(t, "Fire King", {
			...ashBlossom,
			...ashStarlight,
		});
		const otherPrintingId = (await cardView(t, other.deckId)).candidates[0]
			?.printingId;
		if (!otherPrintingId) throw new Error("expected a Printing");

		await expect(
			t.mutation(api.yugioh.decks.choosePrinting, {
				deckCardId,
				printingId: otherPrintingId,
			}),
		).rejects.toThrow(/isn't a Candidate/);
	});
});

describe("removing", () => {
	test("removing a Candidate keeps the others", async () => {
		const t = setup();
		const { deckId, deckCardId } = await deckWithCard(t);
		const candidateId = await t.mutation(
			api.yugioh.decks.addCandidatePrinting,
			{ deckCardId, ...ashStarlight },
		);

		await t.mutation(api.yugioh.decks.removeCandidatePrinting, {
			candidateId,
		});

		const card = await cardView(t, deckId);
		expect(card.candidates.map((c) => c.setCode)).toEqual(["RA01-EN008"]);
	});

	test("removing the Chosen Printing leaves the Card undecided", async () => {
		const t = setup();
		const { deckId, deckCardId } = await deckWithCard(t);
		await t.mutation(api.yugioh.decks.addCandidatePrinting, {
			deckCardId,
			...ashStarlight,
		});
		const [qcsr] = (await cardView(t, deckId)).candidates;
		if (!qcsr) throw new Error("expected a Candidate");
		await t.mutation(api.yugioh.decks.choosePrinting, {
			deckCardId,
			printingId: qcsr.printingId,
		});

		await t.mutation(api.yugioh.decks.removeCandidatePrinting, {
			candidateId: qcsr._id,
		});

		const card = await cardView(t, deckId);
		expect(card.chosenPrintingId).toBeNull();
		expect(card.candidates.map((c) => c.setCode)).toEqual(["MP23-EN001"]);
	});

	test("won't remove a Card's last Candidate", async () => {
		const t = setup();
		const { deckId } = await deckWithCard(t);
		const [only] = (await cardView(t, deckId)).candidates;
		if (!only) throw new Error("expected a Candidate");

		await expect(
			t.mutation(api.yugioh.decks.removeCandidatePrinting, {
				candidateId: only._id,
			}),
		).rejects.toThrow(/Remove the Card instead/);
	});

	test("removing a Card leaves the same Printing in another Deck alone", async () => {
		const t = setup();
		const first = await deckWithCard(t, "Snake-Eye");
		const second = await deckWithCard(t, "Fire King");

		await t.mutation(api.yugioh.decks.removeCard, {
			deckCardId: first.deckCardId,
		});

		const firstDeck = await t.query(api.yugioh.decks.getDeck, {
			deckId: first.deckId,
		});
		expect(firstDeck?.sections).toEqual([]);
		expect(firstDeck?.copiesNeeded).toBe(0);
		const kept = await cardView(t, second.deckId);
		expect(kept.candidates.map((c) => c.setCode)).toEqual(["RA01-EN008"]);
	});
});

describe("Deck view order", () => {
	test("Cards are grouped Main, Extra, Side, finished Cards last in each", async () => {
		const t = setup();
		const deckId = await t.mutation(api.yugioh.decks.createDeck, {
			name: "Snake-Eye",
		});
		async function add(
			cardName: string,
			setCode: string,
			section: "main" | "extra" | "side",
		) {
			return await t.mutation(api.yugioh.decks.addCard, {
				deckId,
				cardName,
				setCode,
				rarity: "Secret Rare",
				overloadedRarities: [],
				section,
				copiesNeeded: 1,
			});
		}
		await add("Called by the Grave", "RA01-EN060", "side");
		const ash = await add("Ash Blossom", "RA01-EN008", "main");
		await add("Snake-Eye Ash", "ROTA-EN001", "main");
		await add("I:P Masquerena", "RA01-EN047", "extra");
		await t.mutation(api.yugioh.decks.updateCard, {
			deckCardId: ash,
			copiesOwned: 1,
		});

		const deck = await t.query(api.yugioh.decks.getDeck, { deckId });

		expect(
			deck?.sections.map((s) => [s.section, s.cards.map((c) => c.cardName)]),
		).toEqual([
			["main", ["Snake-Eye Ash", "Ash Blossom"]],
			["extra", ["I:P Masquerena"]],
			["side", ["Called by the Grave"]],
		]);
	});
});

describe("Printing identity", () => {
	test("a set code + rarity already saved for another Card is rejected", async () => {
		const t = setup();
		await deckWithCard(t);

		await expect(
			deckWithCard(t, "Fire King", {
				...ashBlossom,
				cardName: "Effect Veiler",
			}),
		).rejects.toThrow(/already saved as Ash Blossom & Joyous Spring/);
	});

	test("the Card name match ignores case and spacing", async () => {
		const t = setup();
		await deckWithCard(t);

		await expect(
			deckWithCard(t, "Fire King", {
				...ashBlossom,
				cardName: "ash blossom &  joyous spring",
			}),
		).resolves.toBeDefined();
	});
});

describe("Card order", () => {
	test("a Deck starts in By cost order, and the Custom toggle persists", async () => {
		const t = setup();
		const deckId = await t.mutation(api.yugioh.decks.createDeck, {
			name: "Snake-Eye",
		});
		expect(
			(await t.query(api.yugioh.decks.getDeck, { deckId }))?.cardOrder,
		).toBe("byCost");

		await t.mutation(api.yugioh.decks.setCardOrder, {
			deckId,
			cardOrder: "custom",
		});

		expect(
			(await t.query(api.yugioh.decks.getDeck, { deckId }))?.cardOrder,
		).toBe("custom");
	});

	test("Custom order starts as the By cost order, then follows moves within a Section", async () => {
		const t = setup();
		const { deckId, add } = await orderedDeck(t);
		const ash = await add("Ash Blossom", "main");
		const bystial = await add("Bystial Druiswurm", "main");
		await add("Called by the Grave", "main");
		await add("Masquerena", "extra");
		await t.mutation(api.yugioh.decks.updateCard, {
			deckCardId: ash,
			copiesOwned: 1,
		});
		await t.mutation(api.yugioh.decks.setCardOrder, {
			deckId,
			cardOrder: "custom",
		});
		expect(await names(t, deckId)).toEqual([
			["main", ["Bystial Druiswurm", "Called by the Grave", "Ash Blossom"]],
			["extra", ["Masquerena"]],
		]);

		await t.mutation(api.yugioh.decks.moveCard, {
			deckCardId: ash,
			toIndex: 0,
		});
		await t.mutation(api.yugioh.decks.moveCard, {
			deckCardId: bystial,
			toIndex: 2,
		});

		expect(await names(t, deckId)).toEqual([
			["main", ["Ash Blossom", "Called by the Grave", "Bystial Druiswurm"]],
			["extra", ["Masquerena"]],
		]);
	});

	test("By cost ignores the Custom order, and switching back restores it", async () => {
		const t = setup();
		const { deckId, add } = await orderedDeck(t);
		await add("Ash Blossom", "main");
		const called = await add("Called by the Grave", "main");
		await t.mutation(api.yugioh.decks.setCardOrder, {
			deckId,
			cardOrder: "custom",
		});
		await t.mutation(api.yugioh.decks.moveCard, {
			deckCardId: called,
			toIndex: 0,
		});

		await t.mutation(api.yugioh.decks.setCardOrder, {
			deckId,
			cardOrder: "byCost",
		});
		expect(await names(t, deckId)).toEqual([
			["main", ["Ash Blossom", "Called by the Grave"]],
		]);

		await t.mutation(api.yugioh.decks.setCardOrder, {
			deckId,
			cardOrder: "custom",
		});
		expect(await names(t, deckId)).toEqual([
			["main", ["Called by the Grave", "Ash Blossom"]],
		]);
	});

	test("a Card added or moved to another Section goes to the end of that Section", async () => {
		const t = setup();
		const { deckId, add } = await orderedDeck(t);
		await add("Ash Blossom", "main");
		const bystial = await add("Bystial Druiswurm", "main");
		const called = await add("Called by the Grave", "side");
		await add("Droll & Lock Bird", "side");
		await t.mutation(api.yugioh.decks.setCardOrder, {
			deckId,
			cardOrder: "custom",
		});
		await t.mutation(api.yugioh.decks.moveCard, {
			deckCardId: bystial,
			toIndex: 0,
		});
		await t.mutation(api.yugioh.decks.moveCard, {
			deckCardId: called,
			toIndex: 0,
		});

		await t.mutation(api.yugioh.decks.updateCard, {
			deckCardId: called,
			section: "main",
		});
		await add("Abyss Dweller", "main");

		expect(await names(t, deckId)).toEqual([
			[
				"main",
				[
					"Bystial Druiswurm",
					"Ash Blossom",
					"Called by the Grave",
					"Abyss Dweller",
				],
			],
			["side", ["Droll & Lock Bird"]],
		]);
	});

	test("a move stays inside the Card's Section, clamped to its ends", async () => {
		const t = setup();
		const { deckId, add } = await orderedDeck(t);
		const ash = await add("Ash Blossom", "main");
		await add("Bystial Druiswurm", "main");
		await add("Called by the Grave", "side");
		await t.mutation(api.yugioh.decks.setCardOrder, {
			deckId,
			cardOrder: "custom",
		});

		await t.mutation(api.yugioh.decks.moveCard, {
			deckCardId: ash,
			toIndex: 99,
		});
		expect(await names(t, deckId)).toEqual([
			["main", ["Bystial Druiswurm", "Ash Blossom"]],
			["side", ["Called by the Grave"]],
		]);

		await t.mutation(api.yugioh.decks.moveCard, {
			deckCardId: ash,
			toIndex: -3,
		});
		expect(await names(t, deckId)).toEqual([
			["main", ["Ash Blossom", "Bystial Druiswurm"]],
			["side", ["Called by the Grave"]],
		]);

		await expect(
			t.mutation(api.yugioh.decks.moveCard, { deckCardId: ash, toIndex: 0.5 }),
		).rejects.toThrow("whole number");
	});
});

async function orderedDeck(t: ReturnType<typeof setup>) {
	const deckId = await t.mutation(api.yugioh.decks.createDeck, {
		name: "Snake-Eye",
	});
	let setNumber = 0;
	async function add(cardName: string, section: "main" | "extra" | "side") {
		setNumber += 1;
		return await t.mutation(api.yugioh.decks.addCard, {
			deckId,
			cardName,
			setCode: `RA01-EN${String(setNumber).padStart(3, "0")}`,
			rarity: "Secret Rare",
			overloadedRarities: [],
			section,
			copiesNeeded: 1,
		});
	}
	return { deckId, add };
}

async function names(t: ReturnType<typeof setup>, deckId: Id<"yugiohDecks">) {
	const deck = await t.query(api.yugioh.decks.getDeck, { deckId });
	return deck?.sections.map((s) => [s.section, s.cards.map((c) => c.cardName)]);
}

describe("renormalizing Printing rarities", () => {
	test("fixes bracketed rarity casing and leaves clashing rows alone", async () => {
		const t = setup();
		const base = {
			cardName: "Chaos Lightsworn",
			tcgplayerStatus: "searching" as const,
			tcgplayerProductUrl: null,
			tcgplayerImageUrl: null,
		};
		const [wrongId, clashId] = await t.run(async (ctx) => {
			const wrong = await ctx.db.insert("yugiohPrintings", {
				...base,
				setCode: "MAMA-EN110",
				rarity: "Ultra Rare (pharaoh's Rare)",
				overloadedRarities: ["Secret Rare (pharaoh's Rare)"],
			});
			// Both spellings saved for one set code: the fix would collide.
			await ctx.db.insert("yugiohPrintings", {
				...base,
				setCode: "MAMA-EN108",
				rarity: "Secret Rare (Pharaoh's Rare)",
				overloadedRarities: [],
			});
			const clash = await ctx.db.insert("yugiohPrintings", {
				...base,
				setCode: "MAMA-EN108",
				rarity: "Secret Rare (pharaoh's Rare)",
				overloadedRarities: [],
			});
			return [wrong, clash];
		});

		const result = await t.mutation(
			internal.yugioh.decks.renormalizePrintingRarities,
			{ paginationOpts: { numItems: 10, cursor: null } },
		);

		expect(result).toMatchObject({
			updated: 1,
			conflicts: [clashId],
			isDone: true,
		});
		const fixed = await t.run((ctx) => ctx.db.get(wrongId));
		expect(fixed).toMatchObject({
			rarity: "Ultra Rare (Pharaoh's Rare)",
			overloadedRarities: ["Secret Rare (Pharaoh's Rare)"],
		});
	});
});
