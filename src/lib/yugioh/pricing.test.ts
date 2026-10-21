import { describe, expect, test } from "vitest";
import { parseFrankfurterRates, pricingFrom } from "./pricing";

describe("parseFrankfurterRates", () => {
	test("turns units-per-dollar into dollars per unit", () => {
		// Trimmed from a real GET https://api.frankfurter.dev/v2/rates?base=USD
		// on 2026-10-21.
		const body = [
			{ date: "2026-10-21", base: "USD", quote: "GBP", rate: 0.74995 },
			{ date: "2026-10-21", base: "USD", quote: "JPY", rate: 158.28 },
			{ date: "2026-10-20", base: "USD", quote: "TWD", rate: 32 },
			{ date: "2026-10-21", base: "USD", quote: "USD", rate: 1.0 },
		];

		const rates = parseFrankfurterRates(body);

		expect(rates.map((r) => r.currency)).toEqual(["GBP", "JPY", "TWD"]);
		expect(rates[0]?.usdPerUnit).toBeCloseTo(1.33342, 5);
		expect(rates[1]?.usdPerUnit).toBeCloseTo(0.0063179, 7);
		expect(rates[2]?.usdPerUnit).toBe(0.03125);
	});

	test("skips rows that aren't dollar-based or have no usable rate", () => {
		expect(
			parseFrankfurterRates([
				{ date: "2026-10-21", base: "EUR", quote: "GBP", rate: 0.86 },
				{ date: "2026-10-21", base: "USD", quote: "XXX", rate: 0 },
				{ date: "2026-10-21", base: "USD", quote: "YYY", rate: "1.2" },
				"junk",
			]),
		).toEqual([]);
	});

	test("rejects a response that isn't a list", () => {
		expect(() => parseFrankfurterRates({ message: "not found" })).toThrow();
	});
});

describe("import fee countries", () => {
	test("eBay's two spellings of South Korea share one rate", () => {
		const pricing = pricingFrom([], [{ country: "South Korea", percent: 16 }]);
		expect(pricing.importFee("Korea, South")).toEqual({
			percent: 16,
			defaulted: false,
		});
	});
});
