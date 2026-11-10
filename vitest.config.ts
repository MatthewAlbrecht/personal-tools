import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Only the Launch and Yu-Gi-Oh suites (Convex, lib and extension readers) run under Vitest. Every other `*.test.ts` in
// this repo is a node:test file, and `.worktrees` holds sibling checkouts, so a
// bare `vitest run` must not collect either.
export default defineConfig({
	// tsconfig keeps JSX for Next; component tests compile it themselves.
	oxc: { jsx: { runtime: "automatic" } },
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
			"src/app/yugioh/**/*.test.tsx",
			"convex/henry/**/*.test.ts",
			"src/lib/henry/**/*.test.ts",
			"src/app/henry/**/*.test.tsx",
			"extensions/rym-release-scraper/tests/*.test.ts",
			"convex/_utils/serverSecret.test.ts",
			"convex/_utils/geniusTranslation.test.ts",
			"src/server/convex-server.test.ts",
			"src/lib/session-cookie.test.ts",
			"src/lib/route-access.test.ts",
			"src/lib/collapse-repeated-lyrics.test.ts",
			"convex/zine-track-settings.test.ts",
			"src/lib/zine/zine-second-page.test.ts",
			"src/middleware.test.ts",
		],
		exclude: ["**/node_modules/**", "**/dist/**", ".worktrees/**"],
	},
});
