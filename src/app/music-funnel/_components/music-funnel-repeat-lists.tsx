"use client";

import { useQuery } from "convex/react";
import Image from "next/image";
import type { ReactNode } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { api } from "../../../../convex/_generated/api";

export function MusicFunnelRepeatLists({ userId }: { userId: string }) {
	const trackRepeats = useQuery(api.musicFunnel.listTrackRepeats, {
		userId,
		limit: 25,
	});
	const albumRepeats = useQuery(api.musicFunnel.listAlbumRepeats, {
		userId,
		limit: 25,
	});
	const artistRepeats = useQuery(api.musicFunnel.listArtistRepeats, {
		userId,
		limit: 25,
	});

	return (
		<div className="space-y-6">
			<RepeatCard
				title="Track repeats"
				description="Tracks recommended by two or more distinct sources."
				isLoading={trackRepeats === undefined}
				isEmpty={trackRepeats?.length === 0}
				emptyMessage="No cross-source track repeats yet."
			>
				{trackRepeats?.map((repeat) => (
					<RepeatRow
						key={repeat.spotifyTrackId}
						imageUrl={repeat.albumImageUrl}
						imageAlt={repeat.albumName}
						title={repeat.trackName}
						subtitle={`${repeat.primaryArtistName} · ${repeat.albumName}`}
						sourceCount={repeat.sourceCount}
						sources={repeat.sources.map((s) => s.displayName).join(", ")}
					/>
				))}
			</RepeatCard>

			<RepeatCard
				title="Album repeats"
				description="Albums appearing across multiple recommendation sources."
				isLoading={albumRepeats === undefined}
				isEmpty={albumRepeats?.length === 0}
				emptyMessage="No cross-source album repeats yet."
			>
				{albumRepeats?.map((repeat) => (
					<RepeatRow
						key={repeat.spotifyAlbumId}
						imageUrl={repeat.albumImageUrl}
						imageAlt={repeat.albumName}
						title={repeat.albumName}
						subtitle={`${repeat.primaryArtistName} · ${repeat.contributingTrackCount} tracks`}
						sourceCount={repeat.sourceCount}
						sources={repeat.sources.map((s) => s.displayName).join(", ")}
					/>
				))}
			</RepeatCard>

			<RepeatCard
				title="Artist repeats"
				description="Artists credited on tracks from multiple sources."
				isLoading={artistRepeats === undefined}
				isEmpty={artistRepeats?.length === 0}
				emptyMessage="No cross-source artist repeats yet."
			>
				{artistRepeats?.map((repeat) => (
					<RepeatRow
						key={repeat.spotifyArtistId}
						title={repeat.name}
						subtitle={`${repeat.contributingTrackCount} contributing tracks`}
						sourceCount={repeat.sourceCount}
						sources={repeat.sources.map((s) => s.displayName).join(", ")}
					/>
				))}
			</RepeatCard>
		</div>
	);
}

function RepeatCard({
	title,
	description,
	isLoading,
	isEmpty,
	emptyMessage,
	children,
}: {
	title: string;
	description: string;
	isLoading: boolean;
	isEmpty?: boolean;
	emptyMessage: string;
	children: ReactNode;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<p className="text-muted-foreground text-sm">Loading...</p>
				) : isEmpty ? (
					<p className="text-muted-foreground text-sm">{emptyMessage}</p>
				) : (
					<ul className="space-y-3">{children}</ul>
				)}
			</CardContent>
		</Card>
	);
}

function RepeatRow({
	imageUrl,
	imageAlt,
	title,
	subtitle,
	sourceCount,
	sources,
}: {
	imageUrl?: string;
	imageAlt?: string;
	title: string;
	subtitle: string;
	sourceCount: number;
	sources: string;
}) {
	return (
		<li className="flex items-start gap-3 rounded-lg border p-3">
			{imageUrl ? (
				<Image
					src={imageUrl}
					alt={imageAlt ?? title}
					width={48}
					height={48}
					className="size-12 shrink-0 rounded object-cover"
				/>
			) : (
				<div className="size-12 shrink-0 rounded bg-muted" />
			)}
			<div className="min-w-0 flex-1">
				<p className="font-medium">{title}</p>
				<p className="text-muted-foreground text-sm">{subtitle}</p>
				<p className="mt-1 text-muted-foreground text-xs">
					{sourceCount} sources · {sources}
				</p>
			</div>
		</li>
	);
}
