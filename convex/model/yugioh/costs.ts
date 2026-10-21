// Cost to finish: what each Card in a Deck still costs, from its Candidate
// Printings' Reference prices and buy-now floors on eBay and TCGplayer.
import {
	type CandidatePrices,
	type CardCost,
	cardCost,
	lowestPrice,
} from "../../../src/lib/yugioh/costs";
import { isCardFinished } from "../../../src/lib/yugioh/deck";
import type { Doc, Id } from "../../_generated/dataModel";
import type { PriceReaders } from "./deals";

/**
 * Each Card's cost to finish and buy-now total, judged at the Card's own
 * Lowest acceptable condition. Finished Cards cost nothing and read no
 * prices. `candidates` are the Deck's Candidate Printings; `prices` come from
 * `loadPriceReaders`, shared across Decks so a Printing is read once.
 */
export async function readCardCosts(
	prices: PriceReaders,
	cards: ReadonlyArray<Doc<"yugiohDeckCards">>,
	candidates: ReadonlyArray<Doc<"yugiohCandidatePrintings">>,
): Promise<Map<Id<"yugiohDeckCards">, CardCost>> {
	const costs = new Map<Id<"yugiohDeckCards">, CardCost>();
	for (const card of cards) {
		const wanted = isCardFinished(card)
			? []
			: candidates.filter((candidate) => candidate.deckCardId === card._id);
		const candidatePrices: CandidatePrices[] = await Promise.all(
			wanted.map(async ({ printingId }) => {
				const condition = card.lowestAcceptableCondition;
				const [ebay, tcgplayer, ebayBuyNow, tcgplayerBuyNow] =
					await Promise.all([
						prices.reference("ebay", printingId, condition),
						prices.reference("tcgplayer", printingId, condition),
						prices.buyNow("ebay", printingId, condition),
						prices.buyNow("tcgplayer", printingId, condition),
					]);
				// Each figure takes the cheaper marketplace; the Reference
				// prices themselves stay separate.
				return {
					printingId,
					reference: lowestPrice([ebay.price, tcgplayer.price]),
					buyNow: lowestPrice([ebayBuyNow, tcgplayerBuyNow]),
				};
			}),
		);
		costs.set(card._id, cardCost(card, candidatePrices));
	}
	return costs;
}
