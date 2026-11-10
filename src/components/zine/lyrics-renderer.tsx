import type React from "react";
import { collapseRepeatedLyrics } from "~/lib/collapse-repeated-lyrics";

export function LyricsRenderer({
	lyrics,
	showSectionLabels = true,
	collapseRepeats = false,
}: {
	lyrics: string;
	showSectionLabels?: boolean;
	/** Show lines or short blocks repeated back to back once, marked "(Nx)" */
	collapseRepeats?: boolean;
}) {
	const displayLyrics = collapseRepeats
		? collapseRepeatedLyrics(lyrics)
		: lyrics;
	const allLines = displayLyrics.split("\n");
	const lines = dropLeadingBlankLines(allLines);
	// `data-lyric-line` is the index into `lyrics.split("\n")`, so a zine page can tell which
	// line overflowed.
	const lineOffset = allLines.length - lines.length;
	return lines.map((line, lineIndex) => {
		const lyricLine = lineIndex + lineOffset;
		if (line.trim() === "") {
			return <br key={lineIndex} data-lyric-line={lyricLine} />;
		}

		if (/^\[.*\]$/.test(line.trim())) {
			if (!showSectionLabels) {
				return null;
			}

			return (
				<span
					key={lineIndex}
					className="text-muted-foreground text-sm print:text-xs"
					data-lyric-line={lyricLine}
				>
					{line}
					<br />
				</span>
			);
		}

		return (
			<span key={lineIndex} data-lyric-line={lyricLine}>
				{formatInlineLyrics(line, lineIndex)}
				<br />
			</span>
		);
	});
}

function dropLeadingBlankLines(lines: string[]): string[] {
	let start = 0;
	while (start < lines.length && lines[start]?.trim() === "") {
		start += 1;
	}
	return lines.slice(start);
}

function formatInlineLyrics(
	line: string,
	lineIndex: number,
): React.ReactNode[] {
	const parts: React.ReactNode[] = [];
	const italicRegex = /\*([^*]+)\*/g;
	let lastIndex = 0;
	let italicIndex = 0;
	let match = italicRegex.exec(line);

	while (match !== null) {
		if (match.index > lastIndex) {
			parts.push(line.substring(lastIndex, match.index));
		}

		parts.push(
			<em key={`italic-${lineIndex}-${italicIndex}`} className="italic">
				{match[1]}
			</em>,
		);

		lastIndex = match.index + match[0].length;
		italicIndex += 1;
		match = italicRegex.exec(line);
	}

	if (lastIndex < line.length) {
		parts.push(line.substring(lastIndex));
	}

	return parts.length > 0 ? parts : [line];
}
