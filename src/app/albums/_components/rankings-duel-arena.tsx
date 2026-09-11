"use client";

import { useMutation, useQuery } from "convex/react";
import { Disc3, SkipForward, Undo2 } from "lucide-react";
import Image from "next/image";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Kbd, KbdGroup } from "~/components/ui/kbd";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

type DuelCandidate = {
	userAlbumId: Id<"userAlbums">;
	albumId: Id<"spotifyAlbums">;
	elo?: number;
	title?: string;
	artist?: string;
	imageUrl?: string;
};

const SETTLE_MS = 320;

export function RankingsDuelArena({
	userId,
	year,
}: {
	userId: string;
	year: number;
	onNeedYear?: () => void;
}): ReactNode {
	const [pairSeed, setPairSeed] = useState(() => Date.now());
	const [settlingWinner, setSettlingWinner] = useState<"a" | "b" | null>(null);
	const [busy, setBusy] = useState(false);
	const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const pair = useQuery(api.albumDuels.getPair, {
		userId,
		year,
		seed: pairSeed,
	});
	const duelTop = useQuery(api.albumDuels.listDuelTop, {
		userId,
		year,
		limit: 50,
	});
	const pick = useMutation(api.albumDuels.pick);
	const undoLast = useMutation(api.albumDuels.undoLast);

	useEffect(() => {
		return () => {
			if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
		};
	}, []);

	const handlePick = useCallback(
		async (side: "a" | "b"): Promise<void> => {
			if (!pair || busy || settlingWinner) return;

			const winner = side === "a" ? pair.a : pair.b;
			setBusy(true);
			setSettlingWinner(side);

			try {
				await pick({
					userId,
					year,
					aUserAlbumId: pair.a.userAlbumId,
					bUserAlbumId: pair.b.userAlbumId,
					winnerUserAlbumId: winner.userAlbumId,
				});

				settleTimerRef.current = setTimeout(() => {
					setSettlingWinner(null);
					setBusy(false);
					setPairSeed((s) => s + 1);
					settleTimerRef.current = null;
				}, SETTLE_MS);
			} catch (error) {
				setSettlingWinner(null);
				setBusy(false);
				toast.error(
					error instanceof Error ? error.message : "Could not record duel pick",
				);
			}
		},
		[pair, busy, settlingWinner, pick, userId, year],
	);

	function handleSkip(): void {
		if (busy || settlingWinner) return;
		setPairSeed((s) => s + 1);
	}

	async function handleUndo(): Promise<void> {
		if (busy || settlingWinner) return;
		setBusy(true);
		try {
			const result = await undoLast({ userId });
			if (!result.undone) {
				toast.error("Nothing to undo");
			} else {
				setPairSeed((s) => s + 1);
			}
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not undo last duel",
			);
		} finally {
			setBusy(false);
		}
	}

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement ||
				e.target instanceof HTMLSelectElement ||
				(e.target instanceof HTMLElement && e.target.isContentEditable)
			) {
				return;
			}

			if (e.key === "ArrowLeft" || e.key === "1") {
				e.preventDefault();
				void handlePick("a");
			} else if (e.key === "ArrowRight" || e.key === "2") {
				e.preventDefault();
				void handlePick("b");
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [handlePick]);

	const isLoading = pair === undefined;

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={busy || isLoading}
						onClick={handleSkip}
					>
						<SkipForward data-icon="inline-start" />
						Skip
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={busy || isLoading}
						onClick={() => void handleUndo()}
					>
						<Undo2 data-icon="inline-start" />
						Undo
					</Button>
				</div>
				<div className="hidden items-center gap-2 text-muted-foreground text-xs sm:flex">
					<KbdGroup>
						<Kbd>←</Kbd>
						<Kbd>1</Kbd>
					</KbdGroup>
					<span>A</span>
					<span className="text-muted-foreground/40">·</span>
					<KbdGroup>
						<Kbd>→</Kbd>
						<Kbd>2</Kbd>
					</KbdGroup>
					<span>B</span>
				</div>
			</div>

			{isLoading ? (
				<DuelArenaSkeleton />
			) : pair === null ? (
				<div className="flex min-h-[22rem] flex-col items-center justify-center gap-3 rounded-lg border border-border/60 border-dashed bg-slate-50/50 px-6 text-center dark:bg-slate-950/20">
					<Disc3 className="size-10 text-muted-foreground/45" />
					<p className="font-[family-name:var(--font-display)] text-lg tracking-tight">
						Need at least two rated albums this year
					</p>
					<p className="max-w-xs text-muted-foreground text-sm leading-snug">
						Rate a couple more {year} albums, then come back to sharpen the
						ladder.
					</p>
				</div>
			) : (
				<div
					className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5"
					aria-label="Duel matchup"
				>
					<DuelCard
						candidate={pair.a}
						label="A"
						disabled={busy && settlingWinner === null}
						settling={
							settlingWinner === "a"
								? "win"
								: settlingWinner === "b"
									? "lose"
									: null
						}
						onPick={() => void handlePick("a")}
					/>
					<DuelCard
						candidate={pair.b}
						label="B"
						disabled={busy && settlingWinner === null}
						settling={
							settlingWinner === "b"
								? "win"
								: settlingWinner === "a"
									? "lose"
									: null
						}
						onPick={() => void handlePick("b")}
					/>
				</div>
			)}

			<p className="text-center text-[11px] text-muted-foreground/70 sm:hidden">
				Tap a cover · ←/→ or 1/2
			</p>

			<details className="group mt-2 rounded-md border border-border/50 bg-slate-50/30 open:bg-slate-50/50 dark:bg-slate-950/15 dark:open:bg-slate-950/25">
				<summary className="cursor-pointer list-none px-3 py-2.5 font-medium text-[0.7rem] text-muted-foreground uppercase tracking-[0.14em] marker:content-none [&::-webkit-details-marker]:hidden">
					<span className="inline-flex items-center gap-2">
						Duel Top 50
						<span className="font-normal text-muted-foreground/55 normal-case tracking-normal">
							{duelTop === undefined ? "…" : `${duelTop.length} by Elo`}
						</span>
					</span>
				</summary>
				<div className="border-border/40 border-t px-3 pt-2 pb-3">
					{duelTop === undefined ? (
						<div className="flex flex-col gap-2">
							{Array.from({ length: 5 }).map((_, i) => (
								<div key={i} className="flex items-center gap-2">
									<Skeleton className="h-3 w-5" />
									<Skeleton className="size-7 rounded" />
									<Skeleton className="h-3 flex-1" />
								</div>
							))}
						</div>
					) : duelTop.length === 0 ? (
						<p className="py-2 text-muted-foreground text-xs">
							No duel scores yet — picks will fill this ladder.
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

function DuelCard({
	candidate,
	label,
	disabled,
	settling,
	onPick,
}: {
	candidate: DuelCandidate;
	label: "A" | "B";
	disabled: boolean;
	settling: "win" | "lose" | null;
	onPick: () => void;
}): ReactNode {
	const title = candidate.title ?? "Unknown Album";
	const artist = candidate.artist ?? "Unknown Artist";

	return (
		<button
			type="button"
			aria-label={`Pick ${title} by ${artist}`}
			disabled={disabled}
			onClick={onPick}
			className={cn(
				"group relative flex w-full flex-col overflow-hidden rounded-lg border border-border/70 bg-background text-left outline-none transition-[opacity,transform,box-shadow,border-color] duration-300",
				"hover:border-teal-800/35 hover:shadow-[0_0_0_1px_rgba(19,78,74,0.12)]",
				"focus-visible:border-teal-800/45 focus-visible:ring-2 focus-visible:ring-teal-800/25",
				"disabled:pointer-events-none disabled:opacity-70",
				settling !== null && "pointer-events-none",
				settling === "win" && "scale-[1.02] border-teal-800/40 opacity-100",
				settling === "lose" && "scale-[0.97] opacity-40",
			)}
		>
			<div className="relative aspect-square w-full bg-slate-100 dark:bg-slate-900/60">
				{candidate.imageUrl ? (
					<Image
						src={candidate.imageUrl}
						alt=""
						fill
						sizes="(max-width: 640px) 100vw, 320px"
						className="object-cover"
						priority
					/>
				) : (
					<div className="flex size-full items-center justify-center">
						<Disc3 className="size-16 text-muted-foreground/35" />
					</div>
				)}
				<Badge
					variant="secondary"
					className="absolute top-2.5 left-2.5 h-5 rounded-[4px] border-0 bg-background/85 px-1.5 font-semibold text-[10px] text-foreground/80 uppercase tracking-[0.12em] backdrop-blur-sm"
				>
					{label}
				</Badge>
			</div>
			<div className="flex flex-col gap-1 border-border/40 border-t bg-slate-50/40 px-3.5 py-3 dark:bg-slate-950/30">
				<p className="font-[family-name:var(--font-display)] text-base leading-snug tracking-tight">
					{title}
				</p>
				<p className="truncate text-muted-foreground text-sm">{artist}</p>
				{candidate.elo !== undefined ? (
					<>
						<Separator className="my-1.5 opacity-40" />
						<p className="text-[10px] text-muted-foreground/65 uppercase tracking-[0.12em]">
							Elo{" "}
							<span className="font-medium text-muted-foreground/80 normal-case tabular-nums tracking-normal">
								{Math.round(candidate.elo)}
							</span>
						</p>
					</>
				) : null}
			</div>
		</button>
	);
}

function DuelArenaSkeleton(): ReactNode {
	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
			<DuelCardSkeleton />
			<DuelCardSkeleton />
		</div>
	);
}

function DuelCardSkeleton(): ReactNode {
	return (
		<div className="overflow-hidden rounded-lg border border-border/60">
			<Skeleton className="aspect-square w-full rounded-none" />
			<div className="flex flex-col gap-2 px-3.5 py-3">
				<Skeleton className="h-5 w-3/4" />
				<Skeleton className="h-4 w-1/2" />
				<Skeleton className="mt-1 h-3 w-16" />
			</div>
		</div>
	);
}
