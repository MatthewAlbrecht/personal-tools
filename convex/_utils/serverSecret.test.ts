import { describe, expect, test } from "vitest";

import { bearerMatchesSecret } from "./serverSecret";

const secret = "a-sufficiently-long-secret";

describe("bearerMatchesSecret", () => {
	test("accepts the exact bearer token", async () => {
		expect(await bearerMatchesSecret(`Bearer ${secret}`, secret)).toBe(true);
	});

	test.each([
		["missing header", null],
		["empty header", ""],
		["wrong scheme", `Basic ${secret}`],
		["no scheme", secret],
		["wrong token", "Bearer a-sufficiently-long-secreT"],
		["prefix of the token", `Bearer ${secret.slice(0, -1)}`],
		["token with suffix", `Bearer ${secret}x`],
	])("rejects %s", async (_label, header) => {
		expect(await bearerMatchesSecret(header, secret)).toBe(false);
	});

	test("fails closed when the configured secret is unset or short", async () => {
		expect(await bearerMatchesSecret("Bearer ", undefined)).toBe(false);
		expect(await bearerMatchesSecret("Bearer ", "")).toBe(false);
		expect(await bearerMatchesSecret("Bearer short", "short")).toBe(false);
	});
});
