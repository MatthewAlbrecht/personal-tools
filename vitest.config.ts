import { defineConfig } from "vitest/config";

// Only the Launch Convex suites run under Vitest. Every other `*.test.ts` in
// this repo is a node:test file, and `.worktrees` holds sibling checkouts, so a
// bare `vitest run` must not collect either.
export default defineConfig({
	test: {
		environment: "edge-runtime",
		include: ["convex/launch-*.test.ts"],
		exclude: ["**/node_modules/**", "**/dist/**", ".worktrees/**"],
	},
});
