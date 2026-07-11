"use client";

import { useQuery } from "convex/react";
import Image from "next/image";
import { isNewSince } from "~/lib/music-funnel-visit";
import { formatRelativeTime } from "~/lib/utils";
import { api } from "../../../../convex/_generated/api";
import {
	MusicFunnelNewBadge,
	MusicFunnelNewChrome,
} from "./music-funnel-new-chrome";

export function MusicFunnelRepeatLists({
	userId,
	visitSince,
}: {
	userId: string;
	visitSince: number | null;
}) {
	const repeats = useQuery(api.musicFunnel.listRepeats, {
		userId,
		limit: 60,
	});

	return (
		<section className="space-y-4">
			<div>
				<h2 className="font-semibold text-lg">Repeats</h2>
				<p className="text-muted-foreground text-sm">
					Cross-source tracks, albums, and artists — most recently active first.
				</p>
			</div>
			{repeats === undefined ? (
				<p className="text-muted-foreground text-sm">Loading...</p>
			) : repeats.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					No cross-source repeats yet.
				</p>
			) : (
				<ul className="divide-y">
					{repeats.map((repeat) => (
						<RepeatRow
							key={getRepeatKey(repeat)}
							repeat={repeat}
							visitSince={visitSince}
						/>
					))}
				</ul>
			)}
		</section>
	);
}

function RepeatRow({
	repeat,
	visitSince,
}: {
	repeat: NonNullable<typeof api.musicFunnel.listRepeats._returnType>[number];
	visitSince: number | null;
}) {
	const { title, subtitle, typeLabel, imageUrl, imageAlt } =
		getRepeatDisplay(repeat);
	const sources = repeat.sources.map((source) => source.displayName).join(", ");
	const isNew =
		visitSince !== null && isNewSince(repeat.becameRepeatAt, visitSince);

	return (
		<li className="py-3">
			<MusicFunnelNewChrome isNew={isNew}>
				<div className="flex items-start gap-3">
					{imageUrl ? (
						<Image
							src={imageUrl}
							alt={imageAlt}
							width={40}
							height={40}
							className="size-10 shrink-0 rounded object-cover"
						/>
					) : (
						<div className="size-10 shrink-0 rounded bg-muted" />
					)}
					<div className="min-w-0 flex-1">
						<div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
							<p className="font-medium">{title}</p>
							<span className="font-semibold tabular-nums">
								{repeat.sourceCount}×
							</span>
							<span className="text-muted-foreground text-xs">{typeLabel}</span>
							{isNew ? <MusicFunnelNewBadge /> : null}
						</div>
						<p className="text-muted-foreground text-sm">{subtitle}</p>
						<p className="text-muted-foreground text-xs">{sources}</p>
						<p className="text-muted-foreground text-xs">
							First seen {formatRelativeTime(repeat.firstSeenAt)} · Last seen{" "}
							{formatRelativeTime(repeat.latestSeenAt)}
							{repeat.type === "track" &&
							repeat.addedToRepeatPlaylistAt !== undefined
								? ` · Added to repeats ${formatRelativeTime(repeat.addedToRepeatPlaylistAt)}`
								: null}
						</p>
					</div>
				</div>
			</MusicFunnelNewChrome>
		</li>
	);
}

function getRepeatKey(
	repeat: NonNullable<typeof api.musicFunnel.listRepeats._returnType>[number],
): string {
	if (repeat.type === "track") return repeat.spotifyTrackId;
	if (repeat.type === "album") return repeat.spotifyAlbumId;
	return repeat.spotifyArtistId;
}

function getRepeatDisplay(
	repeat: NonNullable<typeof api.musicFunnel.listRepeats._returnType>[number],
): {
	title: string;
	subtitle: string;
	typeLabel: string;
	imageUrl?: string;
	imageAlt: string;
} {
	if (repeat.type === "track") {
		return {
			title: repeat.trackName,
			subtitle: `${repeat.primaryArtistName} · ${repeat.albumName}`,
			typeLabel: "Track",
			imageUrl: repeat.albumImageUrl,
			imageAlt: repeat.albumName,
		};
	}

	if (repeat.type === "album") {
		return {
			title: repeat.albumName,
			subtitle: `${repeat.primaryArtistName} · ${repeat.contributingTrackCount} tracks`,
			typeLabel: "Album",
			imageUrl: repeat.albumImageUrl,
			imageAlt: repeat.albumName,
		};
	}

	return {
		title: repeat.name,
		subtitle: `${repeat.contributingTrackCount} contributing tracks`,
		typeLabel: "Artist",
		imageAlt: repeat.name,
	};
}
