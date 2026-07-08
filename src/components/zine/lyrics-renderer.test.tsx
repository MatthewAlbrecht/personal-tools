import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

test("LyricsRenderer shows song part labels by default", async () => {
	const renderedText = collectText(
		await renderLyrics({ lyrics: "[Chorus]\nThis is the hook" }),
	);

	assert.match(renderedText, /\[Chorus\]/);
	assert.match(renderedText, /This is the hook/);
});

test("LyricsRenderer drops a leading blank line", async () => {
	const rendered = await renderLyrics({ lyrics: "\nFirst lyric" });
	const nodes = React.Children.toArray(rendered as React.ReactNode);
	const firstElement = nodes.find((node) => React.isValidElement(node)) as
		| React.ReactElement
		| undefined;

	assert.notEqual(firstElement?.type, "br");
});

test("LyricsRenderer drops multiple leading blank lines", async () => {
	const rendered = await renderLyrics({ lyrics: "\n\n\nFirst lyric" });
	const nodes = React.Children.toArray(rendered as React.ReactNode);
	const firstElement = nodes.find((node) => React.isValidElement(node)) as
		| React.ReactElement
		| undefined;

	assert.notEqual(firstElement?.type, "br");
	assert.match(collectText(rendered), /First lyric/);
});

test("LyricsRenderer can hide song part labels", async () => {
	const props = {
		lyrics: "[Verse 1]\nFirst lyric\n\n[Chorus]\nThis is the hook",
		showSectionLabels: false,
	};
	const renderedText = collectText(await renderLyrics(props));

	assert.doesNotMatch(renderedText, /\[Verse 1\]/);
	assert.doesNotMatch(renderedText, /\[Chorus\]/);
	assert.match(renderedText, /First lyric/);
	assert.match(renderedText, /This is the hook/);
});

async function renderLyrics(props: {
	lyrics: string;
	showSectionLabels?: boolean;
}): Promise<React.ReactNode> {
	const globalWithReact = globalThis as typeof globalThis & {
		React?: typeof React;
	};
	globalWithReact.React = React;

	const { LyricsRenderer } = await import("./lyrics-renderer");
	return LyricsRenderer(props);
}

function collectText(node: React.ReactNode): string {
	if (node === null || node === undefined || typeof node === "boolean") {
		return "";
	}

	if (typeof node === "string" || typeof node === "number") {
		return String(node);
	}

	if (Array.isArray(node)) {
		return node.map(collectText).join("");
	}

	if (React.isValidElement(node)) {
		const element = node as React.ReactElement<{ children?: React.ReactNode }>;
		return collectText(element.props.children);
	}

	return "";
}
