import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Only the Launch and Yu-Gi-Oh suites (Convex, lib and extension readers) run under Vitest. Every other `*.test.ts` in
// this repo is a node:test file, and `.worktrees` holds sibling checkouts, so a
// bare `vitest run` must not collect either.
export default defineConfig({
	resolve: {
		alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) },
	},
	test: {
		environment: "edge-runtime",
		include: [
			"convex/launch-*.test.ts",
			"convex/public-surface-lockdown.test.ts",
			"convex/yugioh/**/*.test.ts",
			"src/lib/yugioh/**/*.test.ts",
			"extensions/rym-release-scraper/tests/*.test.ts",
			"convex/_utils/serverSecret.test.ts",
			"src/server/convex-server.test.ts",
			"src/lib/session-cookie.test.ts",
			"src/lib/route-access.test.ts",
			"src/middleware.test.ts",
		],
		exclude: ["**/node_modules/**", "**/dist/**", ".worktrees/**"],
	},
});
