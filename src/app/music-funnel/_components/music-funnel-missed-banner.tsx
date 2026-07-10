"use client";

import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import { summarizeMissed } from "~/lib/music-funnel-visit";
import { api } from "../../../../convex/_generated/api";
import { musicFunnelNewBannerClassName } from "./music-funnel-new-chrome";

export function MusicFunnelMissedBanner({
	userId,
	visitSince,
}: {
	userId: string;
	visitSince: number | null;
}) {
	const [dismissed, setDismissed] = useState(false);

	const sourceRuns = useQuery(api.musicFunnel.listRecentSourceRuns, {
		userId,
		limit: 100,
	});
	const repeats = useQuery(api.musicFunnel.listRepeats, {
		userId,
		limit: 100,
	});

	const summary = useMemo(() => {
		if (
			visitSince === null ||
			sourceRuns === undefined ||
			repeats === undefined
		) {
			return null;
		}
		return summarizeMissed({
			visitSince,
			sourceRuns,
			repeats: repeats.map((repeat) => ({
				type: repeat.type,
				becameRepeatAt: repeat.becameRepeatAt,
			})),
		});
	}, [visitSince, sourceRuns, repeats]);

	if (visitSince === null || dismissed || summary === null) {
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
		setDismissed(true);
	}

	return (
		<div
			className={`${musicFunnelNewBannerClassName} flex flex-wrap items-center justify-between gap-3`}
		>
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
