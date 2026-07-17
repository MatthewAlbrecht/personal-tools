"use client";

import { useQuery } from "convex/react";
import { Disc3, Music2, User } from "lucide-react";
import { useState } from "react";
import { isNewSince } from "~/lib/music-funnel-visit";
import { cn } from "~/lib/utils";
import { api } from "../../../../convex/_generated/api";
import {
	MusicFunnelNewBadge,
	MusicFunnelNewChrome,
} from "./music-funnel-new-chrome";

type RepeatTypeFilter = "all" | "track" | "album" | "artist";

const FILTERS: Array<{ id: RepeatTypeFilter; label: string }> = [
	{ id: "all", label: "All" },
	{ id: "track", label: "Tracks" },
	{ id: "album", label: "Albums" },
	{ id: "artist", label: "Artists" },
];

export function MusicFunnelRepeatLists({
	userId,
	visitSince,
}: {
	userId: string;
	visitSince: number | null;
}) {
	const [typeFilter, setTypeFilter] = useState<RepeatTypeFilter>("all");
	const repeats = useQuery(api.musicFunnel.listRepeats, {
		userId,
		limit: 100,
	});
	const filtered =
		repeats === undefined
			? undefined
			: typeFilter === "all"
				? repeats
				: repeats.filter((repeat) => repeat.type === typeFilter);
	const filteredRepeats = filtered ?? [];

	return (
		<section className="space-y-4">
			<div>
				<h2 className="font-semibold text-lg">Repeats</h2>
				<p className="text-muted-foreground text-sm">
					Cross-source tracks, albums, and artists — most recently active first.
				</p>
			</div>
			<div className="flex flex-wrap gap-2">
				{FILTERS.map((filter) => (
					<button
						key={filter.id}
						type="button"
						onClick={() => setTypeFilter(filter.id)}
						className={cn(
							"rounded-md px-2.5 py-1 text-sm",
							typeFilter === filter.id
								? "bg-foreground text-background"
								: "bg-muted text-muted-foreground hover:text-foreground",
						)}
					>
						{filter.label}
					</button>
				))}
			</div>
			{repeats === undefined ? (
				<p className="text-muted-foreground text-sm">Loading...</p>
			) : repeats.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					No cross-source repeats yet.
				</p>
			) : filteredRepeats.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					No {FILTERS.find((filter) => filter.id === typeFilter)?.label}{" "}
					repeats.
				</p>
			) : (
				<ul className="w-full max-w-md">
					{filteredRepeats.map((repeat) => (
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
	const isNew =
		visitSince !== null && isNewSince(repeat.becameRepeatAt, visitSince);
	const title =
		repeat.type === "track"
			? repeat.trackName
			: repeat.type === "album"
				? repeat.albumName
				: repeat.name;
	const subtitle =
		repeat.type === "track" || repeat.type === "album"
			? repeat.primaryArtistName
			: null;

	return (
		<li>
			<MusicFunnelNewChrome isNew={isNew} className="py-1.5">
				<div className="flex w-full items-center gap-2.5 py-1">
					<RepeatTypeIcon type={repeat.type} />
					<div className="min-w-0 flex-1">
						<p className="truncate font-medium leading-tight">{title}</p>
						{subtitle ? (
							<p className="truncate text-muted-foreground text-xs leading-tight">
								{subtitle}
							</p>
						) : null}
					</div>
					{(repeat.type === "album" || repeat.type === "artist") && (
						<span className="inline-flex shrink-0 items-center gap-1 text-muted-foreground text-xs tabular-nums">
							<Music2 className="size-3.5" aria-hidden />
							{repeat.contributingTrackCount}
						</span>
					)}
					<span className="shrink-0 font-semibold text-sm tabular-nums">
						{repeat.sourceCount}×
					</span>
					{isNew ? <MusicFunnelNewBadge /> : null}
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

function RepeatTypeIcon({
	type,
}: {
	type: "track" | "album" | "artist";
}) {
	const className = cn(
		"flex size-7 shrink-0 items-center justify-center rounded",
		type === "track" &&
			"bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-100",
		type === "album" &&
			"bg-yellow-900/15 text-yellow-950 dark:bg-yellow-900/45 dark:text-yellow-50",
		type === "artist" &&
			"bg-rose-200 text-rose-900 dark:bg-rose-950 dark:text-rose-100",
	);
	return (
		<span className={className} aria-label={type}>
			{type === "track" ? (
				<Music2 className="size-3.5" />
			) : type === "album" ? (
				<Disc3 className="size-3.5" />
			) : (
				<User className="size-3.5" />
			)}
		</span>
	);
}
