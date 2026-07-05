export type IntroContentSpan = {
	text: string;
	bold?: boolean;
	italic?: boolean;
	lineBreakBefore?: boolean;
};

export type IntroContentParagraph = IntroContentSpan[];

export function resolveAlbumIntroContent(
	introPageContent?: string | null,
	summaryOverride?: string | null,
): string {
	const intro = introPageContent?.trim();
	if (intro) {
		return intro;
	}

	return summaryOverride?.trim() ?? "";
}

export function parseIntroContent(content: string): IntroContentParagraph[] {
	const trimmed = content.trim();
	if (trimmed === "") {
		return [];
	}

	return trimmed
		.split(/\n\n+/)
		.map((paragraphText) => parseIntroParagraph(paragraphText))
		.filter((paragraph) => paragraph.length > 0);
}

function parseIntroParagraph(paragraphText: string): IntroContentParagraph {
	const lines = paragraphText.split("\n");
	const spans: IntroContentParagraph = [];

	for (const [lineIndex, line] of lines.entries()) {
		const lineSpans = parseInlineSpans(line);
		if (lineSpans.length === 0) {
			continue;
		}

		if (lineIndex > 0 && lineSpans[0] !== undefined) {
			lineSpans[0] = { ...lineSpans[0], lineBreakBefore: true };
		}

		spans.push(...lineSpans);
	}

	return spans;
}

function parseInlineSpans(text: string): IntroContentSpan[] {
	const spans: IntroContentSpan[] = [];
	const pattern = /\*\*([^*]+)\*\*|\*([^*]+)\*|([^*]+)/g;
	let match = pattern.exec(text);

	while (match !== null) {
		if (match[1] !== undefined) {
			spans.push({ text: match[1], bold: true });
		} else if (match[2] !== undefined) {
			spans.push({ text: match[2], italic: true });
		} else if (match[3] !== undefined && match[3] !== "") {
			spans.push({ text: match[3] });
		}

		match = pattern.exec(text);
	}

	if (spans.length === 0 && text !== "") {
		spans.push({ text });
	}

	return spans;
}
