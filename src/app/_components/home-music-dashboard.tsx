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
		userId ? { userId, limit: 6 } : "skip",
	);
	const needsRating = useQuery(
		api.home.listNeedsRating,
		userId ? { userId, limit: 6 } : "skip",
	);
	const recentlySaved = useQuery(
		api.home.listRecentlySavedForLater,
		userId ? { userId, limit: 6 } : "skip",
	);

	if (isLoading) {
		return <HomeSkeleton />;
	}

	if (!userId) {
		return (
			<div className="mx-auto max-w-3xl px-4 py-16 text-center">
				<p className="text-stone-600">Sign in to open your listening home.</p>
			</div>
		);
	}

	return (
		<div className="relative min-h-full bg-[#e9e8e4] text-stone-950">
			{/* Cool studio wash — light field, no muddy midtones */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_12%_-10%,_oklch(0.78_0.06_195_/_0.45),_transparent_55%),linear-gradient(180deg,_#f3f2ef_0%,_transparent_100%)]"
			/>
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 opacity-[0.04]"
				style={{
					backgroundImage:
						"url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
				}}
			/>

			<div className="relative mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10 lg:gap-10">
				<header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
					<div className="max-w-2xl animate-[home-rise_480ms_ease-out]">
						<p className="mb-2 font-semibold text-[0.7rem] text-teal-800 uppercase tracking-[0.18em]">
							Decide
						</p>
						<h1 className="font-[family-name:var(--font-display)] text-[2.4rem] leading-[1.05] tracking-[-0.025em] sm:text-[2.85rem]">
							What should you play next?
						</h1>
						<p className="mt-3 max-w-lg text-[0.95rem] text-stone-700 leading-relaxed">
							Shortlist from your queue — grab one, or let moooose pick.
						</p>
					</div>
					<div className="flex shrink-0 flex-wrap items-center gap-2 animate-[home-rise_480ms_ease-out_60ms_both]">
						<Button
							type="button"
							onClick={openRecommendationDrawer}
							className="bg-teal-900 text-[#f4f7f6] shadow-sm hover:bg-teal-800"
						>
							Pick for me
						</Button>
						<Button
							asChild
							variant="outline"
							className="border-stone-900/20 bg-[#f7f6f3]/80 text-stone-900 hover:bg-white"
						>
							<Link href="/albums/up-next">Open Queue</Link>
						</Button>
					</div>
				</header>

				<section
					aria-labelledby="play-next-heading"
					className="animate-[home-rise_560ms_ease-out_100ms_both]"
				>
					<div className="overflow-hidden rounded-2xl border border-stone-900/10 bg-[#f7f6f3] shadow-[0_18px_40px_-28px_oklch(0.35_0.02_250_/_0.35)]">
						<div className="flex items-center justify-between gap-3 border-stone-900/8 border-b px-4 py-3.5 sm:px-5">
							<div className="flex items-baseline gap-3">
								<h2
									id="play-next-heading"
									className="font-[family-name:var(--font-display)] text-xl tracking-tight"
								>
									Play Next
								</h2>
								<span className="hidden font-medium text-xs text-stone-600 sm:inline">
									From Queue
								</span>
							</div>
							<span className="rounded-md bg-teal-900/8 px-2 py-0.5 font-semibold text-[0.65rem] text-teal-900 uppercase tracking-[0.12em]">
								Queue
							</span>
						</div>
						<div className="px-1.5 py-1 sm:px-2 sm:py-1.5">
							<AlbumStrip
								rows={playNext}
								empty="Nothing queued yet — add albums to Queue."
								dense
								showIndex
							/>
						</div>
					</div>
				</section>

				<div className="grid gap-4 lg:grid-cols-3">
					<HomeModule
						title="Recently listened"
						href="/albums/recent"
						linkLabel="All recent"
						rows={recent}
						empty="No listens synced yet."
						delayMs={160}
					/>
					<HomeModule
						title="Needs rating"
						href="/albums/recent"
						linkLabel="Rate listens"
						rows={needsRating}
						empty="You're caught up on ratings."
						delayMs={220}
					/>
					<HomeModule
						title="Recently saved"
						href="/albums/up-next"
						linkLabel="Queue"
						rows={recentlySaved}
						empty="No recent saves."
						delayMs={280}
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
	delayMs,
}: {
	title: string;
	href: string;
	linkLabel: string;
	rows: HomeAlbumRow[] | undefined;
	empty: string;
	delayMs: number;
}) {
	return (
		<section
			className="overflow-hidden rounded-xl border border-stone-900/10 bg-[#f7f6f3]"
			style={{
				animation: `home-rise 560ms ease-out ${delayMs}ms both`,
			}}
		>
			<div className="flex items-baseline justify-between gap-2 border-stone-900/8 border-b px-3.5 py-3">
				<h2 className="font-[family-name:var(--font-display)] text-base tracking-tight sm:text-lg">
					{title}
				</h2>
				<Link
					href={href}
					className="font-semibold text-[0.65rem] text-teal-800 uppercase tracking-[0.12em] hover:text-stone-950"
				>
					{linkLabel}
				</Link>
			</div>
			<div className="px-1 py-1">
				<AlbumStrip rows={rows} empty={empty} />
			</div>
		</section>
	);
}

function AlbumStrip({
	rows,
	empty,
	dense = false,
	showIndex = false,
}: {
	rows: HomeAlbumRow[] | undefined;
	empty: string;
	dense?: boolean;
	showIndex?: boolean;
}) {
	if (rows === undefined) {
		return (
			<div className={cn("space-y-2 p-2", dense && "space-y-2.5")}>
				{Array.from({ length: dense ? 5 : 3 }, (_, index) => (
					<Skeleton
						key={index}
						className="h-14 w-full rounded-lg bg-stone-900/8"
					/>
				))}
			</div>
		);
	}

	if (rows.length === 0) {
		return (
			<p className="px-4 py-8 text-center text-sm text-stone-600">{empty}</p>
		);
	}

	return (
		<ul>
			{rows.map((row, index) => (
				<li key={`${row.albumId}-${index}`}>
					<Link
						href={`/albums/details/${row.albumId}`}
						className={cn(
							"group flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-stone-900/[0.04]",
							dense && "py-2.5",
						)}
					>
						{showIndex ? (
							<span className="w-5 shrink-0 text-right font-medium font-mono text-[0.7rem] text-stone-500 tabular-nums">
								{index + 1}
							</span>
						) : null}
						<div className="relative size-11 shrink-0 overflow-hidden rounded-md bg-stone-300 ring-1 ring-stone-900/10 sm:size-12">
							{row.imageUrl ? (
								<Image
									src={row.imageUrl}
									alt=""
									fill
									sizes="48px"
									className="object-cover"
								/>
							) : null}
						</div>
						<div className="min-w-0 flex-1">
							<p className="truncate font-semibold text-[0.925rem] text-stone-950 leading-snug">
								{row.name}
							</p>
							<p className="mt-0.5 truncate text-[0.8125rem] text-stone-600 leading-snug">
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
		<div className="min-h-full bg-[#e9e8e4] px-4 py-10 sm:px-6">
			<div className="mx-auto max-w-5xl space-y-8">
				<Skeleton className="h-12 w-2/3 bg-stone-900/10" />
				<Skeleton className="h-64 w-full rounded-2xl bg-stone-900/10" />
				<div className="grid gap-4 lg:grid-cols-3">
					<Skeleton className="h-48 w-full rounded-xl bg-stone-900/10" />
					<Skeleton className="h-48 w-full rounded-xl bg-stone-900/10" />
					<Skeleton className="h-48 w-full rounded-xl bg-stone-900/10" />
				</div>
			</div>
		</div>
	);
}
