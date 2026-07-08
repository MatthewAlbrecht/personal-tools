import type React from "react";

export function LyricsRenderer({
	lyrics,
	showSectionLabels = true,
}: {
	lyrics: string;
	showSectionLabels?: boolean;
}) {
	return dropLeadingBlankLines(lyrics.split("\n")).map((line, lineIndex) => {
		if (line.trim() === "") {
			return <br key={lineIndex} />;
		}

		if (/^\[.*\]$/.test(line.trim())) {
			if (!showSectionLabels) {
				return null;
			}

			return (
				<span
					key={lineIndex}
					className="text-muted-foreground text-sm print:text-xs"
				>
					{line}
					<br />
				</span>
			);
		}

		return (
			<span key={lineIndex}>
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
