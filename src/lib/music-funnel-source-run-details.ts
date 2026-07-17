export function sortSourceRunEncounterDetails<
	T extends {
		spotifyTrackId: string;
		trackName: string;
		firstSeenAt: number;
	},
>(encounters: T[], repeatWriteTrackIds: ReadonlySet<string>): T[] {
	return [...encounters].sort((left, right) => {
		const leftRepeat = repeatWriteTrackIds.has(left.spotifyTrackId) ? 0 : 1;
		const rightRepeat = repeatWriteTrackIds.has(right.spotifyTrackId) ? 0 : 1;
		if (leftRepeat !== rightRepeat) return leftRepeat - rightRepeat;
		if (left.firstSeenAt !== right.firstSeenAt) {
			return left.firstSeenAt - right.firstSeenAt;
		}
		return left.trackName.localeCompare(right.trackName);
	});
}
