"use client";

import { useQuery } from "convex/react";
import Image from "next/image";
import Link from "next/link";
import { ForLaterRecommendationDrawer } from "~/app/for-later-albums/_components/for-later-recommendation-drawer";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { useForLaterRecommendationDrawer } from "~/lib/hooks/use-for-later-recommendation-drawer";
import { useSpotifyAuth } from "~/lib/hooks/use-spotify-auth";
import { cn } from "~/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type HomeAlbumRow = {
	albumId: Id<"spotifyAlbums">;
	name: string;
	artistName: string;
	imageUrl?: string;
	listenedAt?: number;
	forLaterLastSeenAt?: number;
};

export function HomeMusicDashboard() {
	const { userId, isLoading } = useSpotifyAuth();
	const {
		isRecommendationDrawerOpen,
		openRecommendationDrawer,
		setRecommendationDrawerOpen,
	} = useForLaterRecommendationDrawer();

	const playNext = useQuery(
		api.home.listPlayNextPlaceholder,
		userId ? { userId, limit: 12 } : "skip",
	);
	const recent = useQuery(
		api.home.listRecentListens,
		userId ? { userId, limit: 8 } : "skip",
	);
	const needsRating = useQuery(
		api.home.listNeedsRating,
		userId ? { userId, limit: 8 } : "skip",
	);
	const recentlySaved = useQuery(
		api.home.listRecentlySavedForLater,
		userId ? { userId, limit: 8 } : "skip",
	);

	if (isLoading) {
		return <HomeSkeleton />;
	}

	if (!userId) {
		return (
			<div className="mx-auto max-w-3xl px-4 py-16 text-center">
				<p className="text-muted-foreground">
					Sign in to open your listening home.
				</p>
			</div>
		);
	}

	return (
		<div className="relative overflow-hidden">
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_oklch(0.55_0.09_55_/_0.18),_transparent_55%),linear-gradient(180deg,_oklch(0.16_0.02_55)_0%,_transparent_42%)]"
			/>
			<div className="relative mx-auto flex max-w-5xl flex-col gap-12 px-4 py-10 sm:px-6 sm:py-14">
				<header className="fade-in slide-in-from-bottom-2 max-w-2xl animate-in duration-500">
					<p className="mb-2 font-semibold text-[0.7rem] text-amber-800/80 uppercase tracking-[0.18em] dark:text-amber-200/70">
						Listening home
					</p>
					<h1 className="font-[family-name:var(--font-display)] text-4xl leading-[1.05] tracking-tight sm:text-5xl">
						What should you play next?
					</h1>
					<p className="mt-3 max-w-xl text-base text-muted-foreground sm:text-lg">
						A short list from your queue — refresh picks when you want a
						different cut.
					</p>
				</header>

				<section
					aria-labelledby="play-next-heading"
					className="fade-in slide-in-from-bottom-3 animate-in fill-mode-both delay-100 duration-700"
				>
					<div className="mb-4 flex flex-wrap items-end justify-between gap-3">
						<div>
							<h2
								id="play-next-heading"
								className="font-[family-name:var(--font-display)] text-2xl tracking-tight"
							>
								Play Next
							</h2>
							<p className="text-muted-foreground text-sm">
								Placeholder from Up Next until ranking lands.
							</p>
						</div>
						<div className="flex gap-2">
							<Button type="button" onClick={openRecommendationDrawer}>
								Pick for me
							</Button>
							<Button asChild type="button" variant="outline">
								<Link href="/for-later-albums">Open Up Next</Link>
							</Button>
						</div>
					</div>
					<AlbumStrip
						rows={playNext}
						empty="Nothing queued yet — add albums to Up Next."
						dense
					/>
				</section>

				<div className="grid gap-10 lg:grid-cols-3">
					<HomeModule
						title="Recently listened"
						href="/albums/recent"
						linkLabel="All recent"
						rows={recent}
						empty="No listens synced yet."
						delayClass="delay-150"
					/>
					<HomeModule
						title="Needs rating"
						href="/albums/recent"
						linkLabel="Rate listens"
						rows={needsRating}
						empty="You're caught up on ratings."
						delayClass="delay-200"
					/>
					<HomeModule
						title="Recently saved"
						href="/for-later-albums"
						linkLabel="Up Next"
						rows={recentlySaved}
						empty="No recent saves."
						delayClass="delay-300"
					/>
				</div>
			</div>

			<ForLaterRecommendationDrawer
				userId={userId}
				open={isRecommendationDrawerOpen}
				onOpenChange={setRecommendationDrawerOpen}
			/>
		</div>
	);
}

function HomeModule({
	title,
	href,
	linkLabel,
	rows,
	empty,
	delayClass,
}: {
	title: string;
	href: string;
	linkLabel: string;
	rows: HomeAlbumRow[] | undefined;
	empty: string;
	delayClass: string;
}) {
	return (
		<section
			className={cn(
				"fade-in slide-in-from-bottom-2 animate-in fill-mode-both duration-700",
				delayClass,
			)}
		>
			<div className="mb-3 flex items-baseline justify-between gap-2">
				<h2 className="font-[family-name:var(--font-display)] text-xl tracking-tight">
					{title}
				</h2>
				<Link
					href={href}
					className="text-muted-foreground text-xs uppercase tracking-[0.12em] hover:text-foreground"
				>
					{linkLabel}
				</Link>
			</div>
			<AlbumStrip rows={rows} empty={empty} />
		</section>
	);
}

function AlbumStrip({
	rows,
	empty,
	dense = false,
}: {
	rows: HomeAlbumRow[] | undefined;
	empty: string;
	dense?: boolean;
}) {
	if (rows === undefined) {
		return (
			<div className={cn("space-y-2", dense && "space-y-3")}>
				{Array.from({ length: dense ? 5 : 3 }, (_, index) => (
					<Skeleton key={index} className="h-14 w-full rounded-lg" />
				))}
			</div>
		);
	}

	if (rows.length === 0) {
		return (
			<p className="rounded-lg border border-dashed px-4 py-6 text-muted-foreground text-sm">
				{empty}
			</p>
		);
	}

	return (
		<ul className={cn("space-y-1.5", dense && "space-y-2")}>
			{rows.map((row, index) => (
				<li key={`${row.albumId}-${index}`}>
					<Link
						href={`/albums/details/${row.albumId}`}
						className={cn(
							"group flex items-center gap-3 rounded-lg border border-transparent px-2 py-2 transition-colors hover:border-border hover:bg-card/80",
							dense && "py-2.5",
						)}
					>
						<div className="relative size-11 shrink-0 overflow-hidden rounded-md bg-muted shadow-sm">
							{row.imageUrl ? (
								<Image
									src={row.imageUrl}
									alt=""
									fill
									sizes="44px"
									className="object-cover"
								/>
							) : null}
						</div>
						<div className="min-w-0 flex-1">
							<p className="truncate font-medium text-sm group-hover:text-foreground">
								{row.name}
							</p>
							<p className="truncate text-muted-foreground text-xs">
								{row.artistName}
							</p>
						</div>
					</Link>
				</li>
			))}
		</ul>
	);
}

function HomeSkeleton() {
	return (
		<div className="mx-auto max-w-5xl space-y-8 px-4 py-14">
			<Skeleton className="h-12 w-2/3" />
			<Skeleton className="h-40 w-full" />
			<div className="grid gap-6 lg:grid-cols-3">
				<Skeleton className="h-48 w-full" />
				<Skeleton className="h-48 w-full" />
				<Skeleton className="h-48 w-full" />
			</div>
		</div>
	);
}
