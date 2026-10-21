// The AI step of the TCGplayer lookup: TypeSafe picks which product, if any,
// is the Printing. Tests replace this module with fixed picks.
import { TypeSafeClient, choice, noul } from "@typesafe-ai/sdk";
import type { TcgplayerProduct } from "../../../src/lib/yugioh/tcgplayer";

export type TcgplayerPick = {
	/** The picked product, or null when the AI says none of them is it. */
	productId: number | null;
	/** How likely the pick is right, from 0 to 1. */
	probability: number;
};

const NONE = "none";

function typesafeClient(): TypeSafeClient {
	const apiKey = process.env.TYPESAFE_API_KEY;
	if (!apiKey) {
		throw new Error(
			"TYPESAFE_API_KEY isn't set on this Convex deployment. Set it with `npx convex env set TYPESAFE_API_KEY <key>`.",
		);
	}
	// The Convex runtime has no zstd, so send requests uncompressed.
	return new TypeSafeClient({ apiKey, compression: false });
}

export async function pickTcgplayerProduct(
	printing: { cardName: string; setCode: string; rarity: string },
	products: readonly TcgplayerProduct[],
): Promise<TcgplayerPick> {
	const options: Record<string, string> = {};
	for (const product of products) {
		options[`product_${product.productId}`] =
			`${product.productName} · ${product.setName} · ${product.setCode} · ${product.rarityName}`;
	}
	options[NONE] = "None of these products is that Printing.";

	const { answers } = await typesafeClient().systemOne({
		state: {
			printing,
			products: products.map((product) => ({
				name: product.productName,
				set: product.setName,
				setCode: product.setCode,
				rarity: product.rarityName,
			})),
		},
		questions: {
			product: choice(
				"Which TCGplayer product in `products` is the Yu-Gi-Oh! card `printing`: the same card, the same set code and the same rarity? TCGplayer sometimes uses longer rarity names, such as Prismatic Collector's Rare for Collector's Rare.",
				options,
			),
			anyMatch: noul(
				"Is any product in `products` the same card as `printing`, with the same set code and the same rarity?",
			),
		},
	});

	const picked = answers.product.choice;
	if (picked === NONE || answers.anyMatch.noul < 0.5) {
		return {
			productId: null,
			probability: answers.product.probabilities[NONE] ?? 0,
		};
	}
	return {
		productId: Number(picked.slice("product_".length)),
		probability: Math.min(
			answers.product.probabilities[picked] ?? 0,
			answers.anyMatch.noul,
		),
	};
}
