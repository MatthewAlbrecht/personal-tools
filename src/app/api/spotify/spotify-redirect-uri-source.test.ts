import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authRouteSource = readFileSync(
	"src/app/api/spotify/auth/route.ts",
	"utf8",
);
const callbackRouteSource = readFileSync(
	"src/app/api/spotify/callback/route.ts",
	"utf8",
);
const envSource = readFileSync("src/env.js", "utf8");

test("Spotify OAuth uses the configured app URL for redirects", () => {
	assert.match(envSource, /APP_URL: z\.string\(\)\.url\(\)/);
	assert.match(envSource, /APP_URL: process\.env\.APP_URL/);
	assert.match(authRouteSource, /`\$\{env\.APP_URL\}\/api\/spotify\/callback`/);
	assert.match(
		callbackRouteSource,
		/`\$\{env\.APP_URL\}\/api\/spotify\/callback`/,
	);
	assert.doesNotMatch(authRouteSource, /process\.env\.VERCEL_URL/);
	assert.doesNotMatch(callbackRouteSource, /process\.env\.VERCEL_URL/);
});
