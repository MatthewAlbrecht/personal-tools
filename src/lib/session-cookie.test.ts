// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	constantTimeEqual,
	signSessionCookie,
	verifySessionCookie,
} from "./session-cookie";

const SECRET = "test-secret-at-least-16-chars";
const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

describe("verifySessionCookie", () => {
	it("accepts a freshly signed cookie and returns the username", async () => {
		const token = await signSessionCookie("matt", SECRET, NOW);
		expect(await verifySessionCookie(token, SECRET, NOW + 1000)).toEqual({
			username: "matt",
			issuedAt: NOW,
		});
	});

	it("rejects the old forgeable unsigned base64url(user:ms) cookie", async () => {
		const forged = Buffer.from(`matt:${NOW}`).toString("base64url");
		expect(await verifySessionCookie(forged, SECRET, NOW)).toBeNull();
	});

	it("rejects arbitrary non-empty garbage", async () => {
		expect(await verifySessionCookie("x", SECRET, NOW)).toBeNull();
		expect(await verifySessionCookie("a.b", SECRET, NOW)).toBeNull();
		expect(await verifySessionCookie("", SECRET, NOW)).toBeNull();
	});

	it("rejects a tampered signature", async () => {
		const token = await signSessionCookie("matt", SECRET, NOW);
		const [payload, sig] = token.split(".");
		const flipped = `${sig?.startsWith("A") ? "B" : "A"}${sig?.slice(1)}`;
		expect(
			await verifySessionCookie(`${payload}.${flipped}`, SECRET, NOW),
		).toBeNull();
	});

	it("rejects a tampered payload that keeps the original signature", async () => {
		const token = await signSessionCookie("matt", SECRET, NOW);
		const sig = token.split(".")[1];
		const evil = Buffer.from(`admin:${NOW}`).toString("base64url");
		expect(await verifySessionCookie(`${evil}.${sig}`, SECRET, NOW)).toBeNull();
	});

	it("rejects a cookie signed with a different secret", async () => {
		const token = await signSessionCookie(
			"matt",
			"another-secret-16-chars!!",
			NOW,
		);
		expect(await verifySessionCookie(token, SECRET, NOW)).toBeNull();
	});

	it("rejects an expired cookie (older than 7 days) but accepts just under", async () => {
		const token = await signSessionCookie("matt", SECRET, NOW);
		expect(
			await verifySessionCookie(token, SECRET, NOW + 7 * DAY - 1),
		).not.toBeNull();
		expect(
			await verifySessionCookie(token, SECRET, NOW + 7 * DAY + 1),
		).toBeNull();
	});

	it("keeps the username first in the payload so legacy `split(':')[0]` readers still work", async () => {
		const token = await signSessionCookie("matt", SECRET, NOW);
		const decoded = Buffer.from(token, "base64url").toString();
		expect(decoded.split(":")[0]).toBe("matt");
	});
});

describe("constantTimeEqual", () => {
	it("compares strings correctly", () => {
		expect(constantTimeEqual("hunter2", "hunter2")).toBe(true);
		expect(constantTimeEqual("hunter2", "hunter3")).toBe(false);
		expect(constantTimeEqual("hunter2", "hunter22")).toBe(false);
		expect(constantTimeEqual("", "")).toBe(true);
	});
});
