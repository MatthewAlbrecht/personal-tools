import assert from "node:assert/strict";
import { test } from "vitest";
import { extractLinkPreview } from "./launchActions";

test("extractLinkPreview resolves relative favicon URLs", () => {
	const preview = extractLinkPreview(
		"https://example.com/docs/page",
		`
			<html>
				<head>
					<title>Example docs</title>
					<link rel="shortcut icon" href="../assets/icon.png">
				</head>
			</html>
		`,
	);

	assert.deepEqual(preview, {
		title: "Example docs",
		faviconUrl: "https://example.com/assets/icon.png",
	});
});

test("extractLinkPreview resolves protocol-relative icons and falls back to favicon.ico", () => {
	assert.equal(
		extractLinkPreview(
			"https://example.com/page",
			'<link href="//cdn.example.com/icon.svg" rel="icon">',
		).faviconUrl,
		"https://cdn.example.com/icon.svg",
	);
	assert.equal(
		extractLinkPreview("https://example.com/page", "<title>No icon</title>")
			.faviconUrl,
		"https://example.com/favicon.ico",
	);
});

test("extractLinkPreview ignores an empty data favicon", () => {
	assert.equal(
		extractLinkPreview(
			"https://example.com/page",
			'<link rel="icon" href="data:,">',
		).faviconUrl,
		"https://example.com/favicon.ico",
	);
});
