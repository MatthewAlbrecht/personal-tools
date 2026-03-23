import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const CONVEX_DIR = join(process.cwd(), "convex");
const VALID_CONVEX_COMPONENT = /^[A-Za-z0-9_.]+$/;

test("convex source file path components use only supported characters", () => {
	const convexFiles = collectConvexSourceFiles(CONVEX_DIR);
	const invalidFiles = convexFiles.filter((filePath) => {
		const relativePath = relative(CONVEX_DIR, filePath);
		const components = relativePath.split("/");
		return components.some(
			(component) => !VALID_CONVEX_COMPONENT.test(component),
		);
	});

	assert.deepEqual(invalidFiles, []);
});

function collectConvexSourceFiles(directory: string): string[] {
	const entries = readdirSync(directory);
	const files: string[] = [];

	for (const entry of entries) {
		const entryPath = join(directory, entry);
		const stats = statSync(entryPath);

		if (stats.isDirectory()) {
			files.push(...collectConvexSourceFiles(entryPath));
			continue;
		}

		if (entry.endsWith(".ts") || entry.endsWith(".js")) {
			files.push(entryPath);
		}
	}

	return files;
}
