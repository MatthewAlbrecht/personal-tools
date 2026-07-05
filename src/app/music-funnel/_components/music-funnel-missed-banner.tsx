"use client";

import { useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";

function getLastSeenStorageKey(userId: string): string {
	return `music-funnel-last-seen-${userId}`;
}

function summarizeSince(
	sourceRuns: Doc<"musicFunnelSourceRuns">[],
	since: number,
) {
	const sinceRuns = sourceRuns.filter(
		(run) => run.startedAt > since && run.newEncounters > 0,
	);
	return {
		syncCount: sinceRuns.length,
		repeatTrackCount: sinceRuns.reduce(
			(sum, run) => sum + (run.trackRepeatsFound ?? 0),
			0,
		),
		repeatAlbumCount: sinceRuns.reduce(
			(sum, run) => sum + (run.albumRepeatsFound ?? 0),
			0,
		),
		repeatArtistCount: sinceRuns.reduce(
			(sum, run) => sum + (run.artistRepeatsFound ?? 0),
			0,
		),
	};
}

export function MusicFunnelMissedBanner({ userId }: { userId: string }) {
	const [since, setSince] = useState<number | null>(null);
	const [dismissed, setDismissed] = useState(false);

	useEffect(() => {
		const stored = localStorage.getItem(getLastSeenStorageKey(userId));
		if (stored) {
			const parsed = Number.parseInt(stored, 10);
			if (!Number.isNaN(parsed)) {
				setSince(parsed);
				return;
			}
		}
		const now = Date.now();
		localStorage.setItem(getLastSeenStorageKey(userId), String(now));
		setSince(now);
	}, [userId]);

	const sourceRuns = useQuery(api.musicFunnel.listRecentSourceRuns, {
		userId,
		limit: 100,
	});

	const summary = useMemo(() => {
		if (since === null || sourceRuns === undefined) {
			return null;
		}
		return summarizeSince(sourceRuns, since);
	}, [since, sourceRuns]);

	if (since === null || dismissed || summary === null) {
		return null;
	}

	const hasActivity =
		summary.syncCount > 0 ||
		summary.repeatTrackCount > 0 ||
		summary.repeatAlbumCount > 0 ||
		summary.repeatArtistCount > 0;

	if (!hasActivity) {
		return null;
	}

	function handleDismiss(): void {
		const now = Date.now();
		localStorage.setItem(getLastSeenStorageKey(userId), String(now));
		setSince(now);
		setDismissed(true);
	}

	return (
		<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/40 px-4 py-3">
			<p className="text-sm">
				<span className="font-medium">What you missed: </span>
				{summary.syncCount} sync{summary.syncCount === 1 ? "" : "s"}
				{summary.repeatTrackCount > 0 && (
					<>
						{" · "}
						{summary.repeatTrackCount} repeat track
						{summary.repeatTrackCount === 1 ? "" : "s"}
					</>
				)}
				{summary.repeatArtistCount > 0 && (
					<>
						{" · "}
						{summary.repeatArtistCount} repeat artist
						{summary.repeatArtistCount === 1 ? "" : "s"}
					</>
				)}
				{summary.repeatAlbumCount > 0 && (
					<>
						{" · "}
						{summary.repeatAlbumCount} repeat album
						{summary.repeatAlbumCount === 1 ? "" : "s"}
					</>
				)}
			</p>
			<Button variant="secondary" size="sm" onClick={handleDismiss}>
				Okay
			</Button>
		</div>
	);
}
