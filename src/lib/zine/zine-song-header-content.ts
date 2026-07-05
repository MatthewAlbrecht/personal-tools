export type ZineCreditPart =
	| { kind: "text"; value: string }
	| { kind: "album"; value: string };

export function formatTrackDuration(seconds: number): string {
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;

	return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function formatTrackDurationInput(
	seconds: number | undefined,
): string {
	if (seconds === undefined) {
		return "";
	}

	return formatTrackDuration(seconds);
}

export function parseTrackDurationInput(input: string): number | null {
	const trimmed = input.trim();
	if (!trimmed) {
		return null;
	}

	const match = /^(\d+):(\d{1,2})$/.exec(trimmed);
	if (!match) {
		throw new Error('Use m:ss format, e.g. "3:15"');
	}

	const minutes = Number(match[1]);
	const seconds = Number(match[2]);

	if (seconds >= 60) {
		throw new Error("Seconds must be less than 60");
	}

	return minutes * 60 + seconds;
}

export function getPlaceholderTrackDurationSeconds(position: number): number {
	return 150 + ((position * 17) % 135);
}

export type ZineTrackPrimaryLineParts = {
	trackNumberLabel: string;
	title: string;
	durationText: string;
};

export function buildTrackPrimaryLineParts({
	position,
	title,
	durationSeconds,
}: {
	position: number;
	title: string;
	durationSeconds: number;
}): ZineTrackPrimaryLineParts {
	return {
		trackNumberLabel: `${position.toString().padStart(2, "0")}`,
		title,
		durationText: formatTrackDuration(durationSeconds),
	};
}

export function buildZineCreditParts(
	song: {
		artistName: string;
		albumTitle?: string;
		albumYear?: string;
	},
	options: {
		showArtist: boolean;
		showAlbum: boolean;
		showYear: boolean;
	},
): ZineCreditPart[] {
	const parts: ZineCreditPart[] = [];

	if (options.showArtist && song.artistName) {
		parts.push({ kind: "text", value: song.artistName });
	}

	if (options.showAlbum && song.albumTitle) {
		parts.push({ kind: "album", value: song.albumTitle });
	}

	if (options.showYear && song.albumYear) {
		parts.push({ kind: "text", value: song.albumYear });
	}

	return parts;
}
