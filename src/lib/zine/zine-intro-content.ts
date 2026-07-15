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
	let index = 0;
	let plain = "";

	function flushPlain(): void {
		if (plain === "") {
			return;
		}
		spans.push({ text: plain });
		plain = "";
	}

	while (index < text.length) {
		const char = text[index] ?? "";
		if (char === "*" || char === "_") {
			const closeIndex = text.indexOf(char, index + 1);
			if (closeIndex > index + 1) {
				flushPlain();
				const inner = text.slice(index + 1, closeIndex);
				spans.push(
					char === "*"
						? { text: inner, bold: true }
						: { text: inner, italic: true },
				);
				index = closeIndex + 1;
				continue;
			}
		}

		plain += char;
		index += 1;
	}

	flushPlain();
	return spans;
}
