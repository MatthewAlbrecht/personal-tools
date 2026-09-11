"use client";

import { useMutation, useQuery } from "convex/react";
import { Disc3, SkipForward, Undo2 } from "lucide-react";
import Image from "next/image";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Kbd, KbdGroup } from "~/components/ui/kbd";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";
import { eloUpdate } from "~/lib/duel-elo";
import {
	type DuelPoolItem,
	pickDuelPair,
	seedEloFromRating,
} from "~/lib/duel-pairing";
import { cn } from "~/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { RankedAlbumItem } from "../_utils/types";

type DuelCandidate = {
	userAlbumId: Id<"userAlbums">;
	albumId: Id<"spotifyAlbums">;
	elo: number;
	title?: string;
	artist?: string;
	imageUrl?: string;
};

type ArenaPair = {
	a: DuelCandidate;
	b: DuelCandidate;
};

export function RankingsDuelArena({
	userId,
	year,
	albums,
}: {
	userId: string;
	year: number;
	albums: RankedAlbumItem[];
}): ReactNode {
	const [pairSeed, setPairSeed] = useState(() => Date.now());
	/** Optimistic Elo overrides until listScores catches up after pick. */
	const [eloOverrides, setEloOverrides] = useState<Map<string, number>>(
		() => new Map(),
	);
	const pairRef = useRef<ArenaPair | null>(null);
	const submittedPairKeyRef = useRef<string | null>(null);

	const scores = useQuery(api.albumDuels.listScores, { userId });
	const pick = useMutation(api.albumDuels.pick);
	const undoLast = useMutation(api.albumDuels.undoLast);

	const pool: DuelPoolItem[] = useMemo(() => {
		const items: DuelPoolItem[] = [];
		for (const album of albums) {
			if (typeof album.rating !== "number") continue;
			items.push({
				userAlbumId: album._id,
				albumId: album.albumId,
				rating: album.rating,
				title: album.album?.name,
				artist: album.album?.artistName,
				imageUrl: album.album?.imageUrl,
			});
		}
		return items;
	}, [albums]);

	const eloByUserAlbumId = useMemo(() => {
		const map = new Map<string, number>();
		if (scores) {
			for (const row of scores) {
				map.set(row.userAlbumId, row.elo);
			}
		}
		for (const [id, elo] of eloOverrides) {
			map.set(id, elo);
		}
		return map;
	}, [scores, eloOverrides]);

	const pair = useMemo((): ArenaPair | null => {
		const raw = pickDuelPair(pool, eloByUserAlbumId, pairSeed);
		if (!raw) return null;
		return {
			a: toCandidate(raw.a, eloByUserAlbumId),
			b: toCandidate(raw.b, eloByUserAlbumId),
		};
	}, [pool, eloByUserAlbumId, pairSeed]);

	pairRef.current = pair;

	const duelTop = useMemo(() => {
		return [...pool]
			.map((item) => ({
				...item,
				elo:
					eloByUserAlbumId.get(item.userAlbumId) ??
					seedEloFromRating(item.rating),
			}))
			.sort(
				(a, b) =>
					b.elo - a.elo || a.userAlbumId.localeCompare(b.userAlbumId),
			)
			.slice(0, 50);
	}, [pool, eloByUserAlbumId]);

	const handlePick = useCallback(
		(side: "a" | "b"): void => {
			const current = pairRef.current;
			if (!current) return;

			const pairKey = `${current.a.userAlbumId}:${current.b.userAlbumId}`;
			if (submittedPairKeyRef.current === pairKey) return;
			submittedPairKeyRef.current = pairKey;

			const winnerSide = side;
			const winner =
				winnerSide === "a" ? current.a.userAlbumId : current.b.userAlbumId;
			const nextScores = eloUpdate(
				current.a.elo,
				current.b.elo,
				winnerSide,
			);

			// Instant next matchup — mutation is background.
			setEloOverrides((prev) => {
				const next = new Map(prev);
				next.set(current.a.userAlbumId, nextScores.a);
				next.set(current.b.userAlbumId, nextScores.b);
				return next;
			});
			setPairSeed((s) => s + 1);

			void pick({
				userId,
				year,
				aUserAlbumId: current.a.userAlbumId,
				bUserAlbumId: current.b.userAlbumId,
				winnerUserAlbumId: winner,
			})
				.then((result) => {
					setEloOverrides((prev) => {
						const next = new Map(prev);
						next.set(current.a.userAlbumId, result.aAfter);
						next.set(current.b.userAlbumId, result.bAfter);
						return next;
					});
				})
				.catch((error: unknown) => {
					toast.error(
						error instanceof Error
							? error.message
							: "Could not record duel pick",
					);
				});
		},
		[pick, userId, year],
	);

	const handleSkip = useCallback((): void => {
		submittedPairKeyRef.current = null;
		setPairSeed((s) => s + 1);
	}, []);

	const handleUndo = useCallback((): void => {
		submittedPairKeyRef.current = null;
		setEloOverrides(new Map());
		setPairSeed((s) => s + 1);

		void undoLast({ userId })
			.then((result) => {
				if (!result.undone) {
					toast.error("Nothing to undo");
				}
			})
			.catch((error: unknown) => {
				toast.error(
					error instanceof Error
						? error.message
						: "Could not undo last duel",
				);
			});
	}, [undoLast, userId]);

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (e.repeat) return;
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement ||
				e.target instanceof HTMLSelectElement ||
				(e.target instanceof HTMLElement && e.target.isContentEditable)
			) {
				return;
			}

			if (e.key === "ArrowLeft" || e.key === "1" || e.key === "a" || e.key === "A") {
				e.preventDefault();
				handlePick("a");
			} else if (
				e.key === "ArrowRight" ||
				e.key === "2" ||
				e.key === "b" ||
				e.key === "B"
			) {
				e.preventDefault();
				handlePick("b");
			} else if (e.key === "s" || e.key === "S") {
				e.preventDefault();
				handleSkip();
			} else if (e.key === "u" || e.key === "U") {
				e.preventDefault();
				handleUndo();
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [handlePick, handleSkip, handleUndo]);

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={pool.length < 2}
						onClick={handleSkip}
					>
						<SkipForward data-icon="inline-start" />
						Skip
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={handleUndo}
					>
						<Undo2 data-icon="inline-start" />
						Undo
					</Button>
				</div>
				<div className="hidden items-center gap-2 text-muted-foreground text-xs sm:flex">
					<KbdGroup>
						<Kbd>←</Kbd>
						<Kbd>1</Kbd>
						<Kbd>A</Kbd>
					</KbdGroup>
					<span>A</span>
					<span className="text-muted-foreground/40">·</span>
					<KbdGroup>
						<Kbd>→</Kbd>
						<Kbd>2</Kbd>
						<Kbd>B</Kbd>
					</KbdGroup>
					<span>B</span>
					<span className="text-muted-foreground/40">·</span>
					<Kbd>S</Kbd>
					<span>Skip</span>
					<span className="text-muted-foreground/40">·</span>
					<Kbd>U</Kbd>
					<span>Undo</span>
				</div>
			</div>

			{pool.length < 2 ? (
				<div className="flex min-h-[22rem] flex-col items-center justify-center gap-3 rounded-lg border border-border/60 border-dashed bg-slate-50/50 px-6 text-center dark:bg-slate-950/20">
					<Disc3 className="size-10 text-muted-foreground/45" />
					<p className="font-[family-name:var(--font-display)] text-lg tracking-tight">
						Need at least two albums in this frame
					</p>
					<p className="max-w-xs text-muted-foreground text-sm leading-snug">
						Widen the frame to Full year, or rate a couple more {year} albums.
					</p>
				</div>
			) : pair === null ? (
				<DuelArenaSkeleton />
			) : (
				<div
					className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6"
					aria-label="Duel matchup"
				>
					<DuelCard
						key={`${pair.a.userAlbumId}-a`}
						candidate={pair.a}
						label="A"
						onPick={() => handlePick("a")}
					/>
					<DuelCard
						key={`${pair.b.userAlbumId}-b`}
						candidate={pair.b}
						label="B"
						onPick={() => handlePick("b")}
					/>
				</div>
			)}

			<p className="text-center text-[11px] text-muted-foreground/70 sm:hidden">
				Tap · ←/→ · 1/2 · A/B · S skip · U undo
			</p>

			<details className="group mt-2 rounded-md border border-border/50 bg-slate-50/30 open:bg-slate-50/50 dark:bg-slate-950/15 dark:open:bg-slate-950/25">
				<summary className="cursor-pointer list-none px-3 py-2.5 font-medium text-[0.7rem] text-muted-foreground uppercase tracking-[0.14em] marker:content-none [&::-webkit-details-marker]:hidden">
					<span className="inline-flex items-center gap-2">
						Duel Top 50
						<span className="font-normal text-muted-foreground/55 normal-case tracking-normal">
							{duelTop.length} by Elo
						</span>
					</span>
				</summary>
				<div className="border-border/40 border-t px-3 pt-2 pb-3">
					{duelTop.length === 0 ? (
						<p className="py-2 text-muted-foreground text-xs">
							No rated albums in this year yet.
						</p>
					) : (
						<ol className="flex max-h-64 flex-col gap-1.5 overflow-y-auto overscroll-contain">
							{duelTop.map((row, index) => (
								<li
									key={row.userAlbumId}
									className="flex items-center gap-2.5 py-0.5"
								>
									<span className="w-5 shrink-0 text-right font-[family-name:var(--font-display)] text-muted-foreground/80 text-xs tabular-nums">
										{index + 1}
									</span>
									{row.imageUrl ? (
										<div className="relative size-7 shrink-0 overflow-hidden rounded-sm bg-muted">
											<Image
												src={row.imageUrl}
												alt=""
												fill
												sizes="28px"
												className="object-cover"
											/>
										</div>
									) : (
										<div className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-muted">
											<Disc3 className="size-3.5 text-muted-foreground/50" />
										</div>
									)}
									<div className="min-w-0 flex-1">
										<p className="truncate text-xs leading-tight">
											{row.title ?? "Unknown"}
										</p>
										<p className="truncate text-[10px] text-muted-foreground">
											{row.artist ?? "Unknown"}
										</p>
									</div>
									<span className="shrink-0 text-[10px] text-muted-foreground/70 tabular-nums">
										{Math.round(row.elo)}
									</span>
								</li>
							))}
						</ol>
					)}
				</div>
			</details>
		</div>
	);
}

function toCandidate(
	item: DuelPoolItem,
	eloByUserAlbumId: Map<string, number>,
): DuelCandidate {
	return {
		userAlbumId: item.userAlbumId as Id<"userAlbums">,
		albumId: item.albumId as Id<"spotifyAlbums">,
		elo:
			eloByUserAlbumId.get(item.userAlbumId) ??
			seedEloFromRating(item.rating),
		title: item.title,
		artist: item.artist,
		imageUrl: item.imageUrl,
	};
}

function DuelCard({
	candidate,
	label,
	onPick,
}: {
	candidate: DuelCandidate;
	label: "A" | "B";
	onPick: () => void;
}): ReactNode {
	const title = candidate.title ?? "Unknown Album";
	const artist = candidate.artist ?? "Unknown Artist";

	return (
		<button
			type="button"
			aria-label={`Pick ${title} by ${artist}`}
			onClick={onPick}
			className={cn(
				"group relative flex w-full flex-col overflow-hidden rounded-lg border border-border/70 bg-background text-left outline-none transition-[box-shadow,border-color] duration-100",
				"hover:border-teal-800/35 hover:shadow-[0_0_0_1px_rgba(19,78,74,0.12)]",
				"focus-visible:border-teal-800/45 focus-visible:ring-2 focus-visible:ring-teal-800/25",
			)}
		>
			<div className="relative aspect-square w-full bg-slate-100 dark:bg-slate-900/60">
				{candidate.imageUrl ? (
					<Image
						src={candidate.imageUrl}
						alt=""
						fill
						sizes="(max-width: 640px) 100vw, 420px"
						className="object-cover"
						priority
					/>
				) : (
					<div className="flex size-full items-center justify-center">
						<Disc3 className="size-20 text-muted-foreground/35" />
					</div>
				)}
				<Badge
					variant="secondary"
					className="absolute top-3 left-3 h-5 rounded-[4px] border-0 bg-background/85 px-1.5 font-semibold text-[10px] text-foreground/80 uppercase tracking-[0.12em] backdrop-blur-sm"
				>
					{label}
				</Badge>
			</div>
			<div className="flex flex-col gap-1 border-border/40 border-t bg-slate-50/40 px-4 py-3.5 dark:bg-slate-950/30">
				<p className="font-[family-name:var(--font-display)] text-lg leading-snug tracking-tight">
					{title}
				</p>
				<p className="truncate text-muted-foreground text-sm">{artist}</p>
				<Separator className="my-1.5 opacity-40" />
				<p className="text-[10px] text-muted-foreground/65 uppercase tracking-[0.12em]">
					Elo{" "}
					<span className="font-medium text-muted-foreground/80 normal-case tabular-nums tracking-normal">
						{Math.round(candidate.elo)}
					</span>
				</p>
			</div>
		</button>
	);
}

function DuelArenaSkeleton(): ReactNode {
	return (
		<div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
			<DuelCardSkeleton />
			<DuelCardSkeleton />
		</div>
	);
}

function DuelCardSkeleton(): ReactNode {
	return (
		<div className="overflow-hidden rounded-lg border border-border/60">
			<Skeleton className="aspect-square w-full rounded-none" />
			<div className="flex flex-col gap-2 px-4 py-3.5">
				<Skeleton className="h-6 w-3/4" />
				<Skeleton className="h-4 w-1/2" />
				<Skeleton className="mt-1 h-3 w-16" />
			</div>
		</div>
	);
}
