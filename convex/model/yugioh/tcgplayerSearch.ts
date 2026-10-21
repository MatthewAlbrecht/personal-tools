// TCGplayer's product search, the endpoint its own site uses. Undocumented,
// so keep calls rare: one per new Printing. Shape and request body:
// docs/yugioh/references/tcgplayer-product-lookup.md.
import {
	type TcgplayerProduct,
	parseTcgplayerProduct,
	parseTcgplayerSearchResponse,
} from "../../../src/lib/yugioh/tcgplayer";

const API = "https://mp-search-api.tcgplayer.com/v1";
const SEARCH_URL = `${API}/search/request`;
const MAX_RESULTS = 25;

/** Yu-Gi-Oh products whose search matches a set code, e.g. "RA01-EN008". */
export async function searchTcgplayerProducts(
	setCode: string,
): Promise<TcgplayerProduct[]> {
	const params = new URLSearchParams({ q: setCode, isList: "false" });
	const response = await fetch(`${SEARCH_URL}?${params.toString()}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			// Without sales_dismax a set-code query returns nothing.
			algorithm: "sales_dismax",
			from: 0,
			size: MAX_RESULTS,
			filters: {
				term: { productLineName: ["yugioh"] },
				range: {},
				match: {},
			},
			listingSearch: {
				filters: {
					term: {},
					range: {},
					exclude: { channelExclusion: 0 },
				},
				context: { cart: {} },
			},
			context: { cart: {}, shippingCountry: "US" },
			settings: { useFuzzySearch: true, didYouMean: {} },
			sort: {},
		}),
	});
	if (!response.ok) {
		throw new Error(`TCGplayer search failed with ${response.status}.`);
	}
	return parseTcgplayerSearchResponse(await response.json());
}

/** One product's details, or null when TCGplayer has no such product. */
export async function fetchTcgplayerProduct(
	productId: number,
): Promise<TcgplayerProduct | null> {
	const response = await fetch(`${API}/product/${productId}/details`);
	// An unknown id answers 400 or 404.
	if (response.status === 400 || response.status === 404) return null;
	if (!response.ok) {
		throw new Error(
			`TCGplayer product details failed with ${response.status}.`,
		);
	}
	return parseTcgplayerProduct(await response.json());
}
