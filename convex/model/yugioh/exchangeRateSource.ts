// Daily exchange rates from Frankfurter: free, no key, no attribution needed.
// Shape and alternatives: docs/yugioh/references/exchange-rates-and-import-fees.md.
import {
	type ExchangeRate,
	parseFrankfurterRates,
} from "../../../src/lib/yugioh/pricing";

const RATES_URL = "https://api.frankfurter.dev/v2/rates?base=USD";
const SOURCE = "Frankfurter";

/** Today's dollar value of every currency the source publishes. */
export async function fetchUsdRates(): Promise<{
	source: string;
	rates: ExchangeRate[];
}> {
	const response = await fetch(RATES_URL, {
		headers: { Accept: "application/json" },
	});
	if (!response.ok) {
		throw new Error(`Frankfurter answered ${response.status}`);
	}
	const rates = parseFrankfurterRates(await response.json());
	if (rates.length === 0) throw new Error("Frankfurter returned no rates");
	return { source: SOURCE, rates };
}
