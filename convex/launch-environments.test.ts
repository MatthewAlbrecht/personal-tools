import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

const source = await readFile(new URL("./launch.ts", import.meta.url), "utf8");
const handler = source.match(
	/export const setProjectEnvironment[\s\S]*?\n\}\);\n/,
)?.[0];

test("setting an environment updates only the targeted bookmark", () => {
	expect(handler).toBeDefined();
	expect(handler).not.toMatch(/query\("launchBookmarks"\)/);
	expect(handler).not.toMatch(/bookmark\._id === args\.id/);
});

test("all membership environments, including local, are valid", () => {
	for (const environment of ["prod", "qa", "stage", "dev", "local"]) {
		expect(source).toMatch(new RegExp(`v\\.literal\\("${environment}"\\)`));
	}
});
