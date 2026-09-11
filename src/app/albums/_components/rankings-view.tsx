"use client";

import { useQuery } from "convex/react";
import { ArrowDown, ArrowUp, Disc3, SlidersHorizontal } from "lucide-react";
import {
	type ReactNode,
	type RefObject,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Kbd, KbdGroup } from "~/components/ui/kbd";
import { Separator } from "~/components/ui/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "~/components/ui/sheet";
import { TIER_ORDER, type TierName, getTierInfo } from "~/lib/album-tiers";
import { useDebouncedCallback } from "~/lib/hooks/use-debounced-callback";
import {
	assignOrdinals,
	compareManualRank,
	decadeLabel,
	frameManualBoard,
} from "~/lib/ranking-ordinals";
import { previousSundayUtcMs } from "~/lib/ranking-week";
import { type WowSignal, wowSignals } from "~/lib/ranking-wow";
import { cn } from "~/lib/utils";
import { api } from "../../../../convex/_generated/api";
import { useAlbums } from "../_context/albums-context";
import type { RankedAlbumItem } from "../_utils/types";
import { RankingBoardRow, RankingBoardRowSkeleton } from "./ranking-board-row";
import { RankingsDuelArena } from "./rankings-duel-arena";
import {
	RankingsFilters,
	type RankingsFrame,
	type RankingsMode,
} from "./rankings-filters";

export function RankingsView({
	albumsByTier,
	availableYears,
	yearFilter,
	onYearFilterChange,
	isLoading,
	onUpdateRating,
}: {
	albumsByTier: Map<
		TierName,
		{ high: RankedAlbumItem[]; med: RankedAlbumItem[]; low: RankedAlbumItem[] }
	>;
	availableYears: number[];
	yearFilter: string;
	onYearFilterChange: (year: string) => void;
	isLoading: boolean;
	onUpdateRating: (
		userAlbumId: string,
		rating: number,
		position: number,
	) => void;
}): ReactNode {
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
	const [optimisticUpdates, setOptimisticUpdates] = useState<
		Map<string, { rating: number; position: number }>
	>(new Map());
	const [savedAlbumId, setSavedAlbumId] = useState<string | null>(null);
	const [scrollTrigger, setScrollTrigger] = useState(0);
	const [frame, setFrame] = useState<RankingsFrame>("top");
	const [mode, setMode] = useState<RankingsMode>("board");
	const [filtersOpen, setFiltersOpen] = useState(false);
	const selectedRowRef = useRef<HTMLDivElement>(null);
	const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const { userId } = useAlbums();

	const yearIsAll = yearFilter === "all";
	const yearNumber = yearIsAll ? null : Number.parseInt(yearFilter, 10);
	const wowEnabled =
		!yearIsAll && userId !== null && !Number.isNaN(yearNumber ?? Number.NaN);
	const weekSundayUtcMs = useMemo(() => previousSundayUtcMs(Date.now()), []);

	const priorWeekSnapshot = useQuery(
		api.rankingSnapshots.getCompleteWeek,
		wowEnabled && yearNumber !== null
			? { userId, year: yearNumber, weekSundayUtcMs }
			: "skip",
	);

	const priorOrdinals = useMemo(() => {
		if (!priorWeekSnapshot) return null;
		const map = new Map<string, number>();
		for (const entry of priorWeekSnapshot.entries) {
			map.set(entry.userAlbumId, entry.ordinal);
		}
		return map;
	}, [priorWeekSnapshot]);

	const showWowHint = wowEnabled && priorWeekSnapshot === null;
	const isReorderingEnabled = !yearIsAll && mode === "board";

	const debouncedUpdate = useDebouncedCallback(
		(userAlbumId: string, rating: number, position: number) => {
			onUpdateRating(userAlbumId, rating, position);
			setSavedAlbumId(userAlbumId);
			if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
			savedTimeoutRef.current = setTimeout(() => setSavedAlbumId(null), 1500);
		},
		800,
	);

	const flatAlbums = useMemo(() => {
		const allAlbums: RankedAlbumItem[] = [];
		for (const tier of TIER_ORDER) {
			const tierData = albumsByTier.get(tier);
			if (!tierData) continue;
			allAlbums.push(...tierData.high, ...tierData.med, ...tierData.low);
		}

		const withOptimistic = allAlbums.map((a) => {
			const update = optimisticUpdates.get(a._id);
			if (update) {
				return { ...a, rating: update.rating, position: update.position };
			}
			return a;
		});

		return withOptimistic.sort((a, b) =>
			compareManualRank(
				{ rating: a.rating ?? null, position: a.position ?? null },
				{ rating: b.rating ?? null, position: b.position ?? null },
			),
		);
	}, [albumsByTier, optimisticUpdates]);

	const rankedAlbums = useMemo(() => assignOrdinals(flatAlbums), [flatAlbums]);

	const framed = useMemo(
		() =>
			frameManualBoard(rankedAlbums, {
				fullYear: frame === "full",
			}),
		[rankedAlbums, frame],
	);

	const visibleAlbums = useMemo(
		() => [...framed.top50, ...framed.edge51to65, ...framed.rest],
		[framed],
	);

	const moveAlbum = useCallback(
		(direction: "up" | "down") => {
			if (selectedIndex === null || !isReorderingEnabled) return;
			const album = visibleAlbums[selectedIndex];
			if (!album) return;

			const currentRating = album.rating ?? 8;
			const currentPosition = album.position ?? 0;

			const albumsInSameTier = visibleAlbums.filter(
				(a) => a.rating === currentRating && a._id !== album._id,
			);
			const sortedSameTier = albumsInSameTier.sort(
				(a, b) => (a.position ?? 0) - (b.position ?? 0),
			);

			const albumsAbove = sortedSameTier.filter(
				(a) => (a.position ?? 0) < currentPosition,
			);
			const albumsBelow = sortedSameTier.filter(
				(a) => (a.position ?? 0) > currentPosition,
			);

			let newRating: number;
			let newPosition: number;
			let newSelectedIndex: number;

			if (direction === "up") {
				if (albumsAbove.length > 0) {
					const albumAbove = albumsAbove[albumsAbove.length - 1];
					if (!albumAbove) return;

					const albumAboveThat =
						albumsAbove.length > 1 ? albumsAbove[albumsAbove.length - 2] : null;

					newRating = currentRating;
					if (albumAboveThat) {
						newPosition =
							((albumAboveThat.position ?? 0) + (albumAbove.position ?? 0)) / 2;
					} else {
						newPosition = (albumAbove.position ?? 0) - 1;
					}

					const newFlatIndex = visibleAlbums.findIndex(
						(a) => a._id === albumAbove._id,
					);
					newSelectedIndex = newFlatIndex >= 0 ? newFlatIndex : selectedIndex;
				} else {
					if (currentRating >= 15) return;

					newRating = currentRating + 1;

					const albumsInNewTier = visibleAlbums.filter(
						(a) => a.rating === newRating,
					);
					if (albumsInNewTier.length > 0) {
						const lastInNewTier = albumsInNewTier.sort(
							(a, b) => (b.position ?? 0) - (a.position ?? 0),
						)[0];
						if (!lastInNewTier) return;
						newPosition = (lastInNewTier.position ?? 0) + 1;
					} else {
						newPosition = 0;
					}

					newSelectedIndex = selectedIndex;
				}
			} else {
				if (albumsBelow.length > 0) {
					const albumBelow = albumsBelow[0];
					if (!albumBelow) return;

					const albumBelowThat = albumsBelow.length > 1 ? albumsBelow[1] : null;

					newRating = currentRating;
					if (albumBelowThat) {
						newPosition =
							((albumBelow.position ?? 0) + (albumBelowThat.position ?? 0)) / 2;
					} else {
						newPosition = (albumBelow.position ?? 0) + 1;
					}

					const newFlatIndex = visibleAlbums.findIndex(
						(a) => a._id === albumBelow._id,
					);
					newSelectedIndex = newFlatIndex >= 0 ? newFlatIndex : selectedIndex;
				} else {
					if (currentRating <= 1) return;

					newRating = currentRating - 1;

					const albumsInNewTier = visibleAlbums.filter(
						(a) => a.rating === newRating,
					);
					if (albumsInNewTier.length > 0) {
						const firstInNewTier = albumsInNewTier.sort(
							(a, b) => (a.position ?? 0) - (b.position ?? 0),
						)[0];
						if (!firstInNewTier) return;
						newPosition = (firstInNewTier.position ?? 0) - 1;
					} else {
						newPosition = 0;
					}

					newSelectedIndex = selectedIndex;
				}
			}

			setOptimisticUpdates((prev) => {
				const next = new Map(prev);
				next.set(album._id, { rating: newRating, position: newPosition });
				return next;
			});

			setSelectedIndex(newSelectedIndex);
			setScrollTrigger((n) => n + 1);

			debouncedUpdate(album._id, newRating, newPosition);
		},
		[selectedIndex, visibleAlbums, isReorderingEnabled, debouncedUpdate],
	);

	useEffect(() => {
		if (!isReorderingEnabled) return;

		function handleKeyDown(e: KeyboardEvent) {
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement ||
				e.target instanceof HTMLSelectElement
			) {
				return;
			}

			if (e.key === "ArrowUp" || e.key === "ArrowDown") {
				e.preventDefault();

				if (e.altKey) {
					moveAlbum(e.key === "ArrowUp" ? "up" : "down");
				} else {
					setSelectedIndex((prev) => {
						if (prev === null) return visibleAlbums.length > 0 ? 0 : null;
						const next = e.key === "ArrowUp" ? prev - 1 : prev + 1;
						if (next < 0 || next >= visibleAlbums.length) return prev;
						return next;
					});
				}
			} else if (e.key === "Escape") {
				setSelectedIndex(null);
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isReorderingEnabled, visibleAlbums.length, moveAlbum]);

	useEffect(() => {
		const frameId = requestAnimationFrame(() => {
			const el = selectedRowRef.current;
			if (!el) return;

			const padding = 240;
			const elRect = el.getBoundingClientRect();

			if (elRect.top < padding) {
				window.scrollBy({ top: elRect.top - padding, behavior: "smooth" });
			} else if (elRect.bottom > window.innerHeight - padding) {
				window.scrollBy({
					top: elRect.bottom - window.innerHeight + padding,
					behavior: "smooth",
				});
			}
		});

		return () => cancelAnimationFrame(frameId);
	}, [selectedIndex, scrollTrigger]);

	useEffect(() => {
		setSelectedIndex(null);
		setOptimisticUpdates(new Map());
	}, [yearFilter]);

	useEffect(() => {
		if (yearIsAll && mode === "duel") {
			setMode("board");
		}
	}, [yearIsAll, mode]);

	useEffect(() => {
		setSelectedIndex(null);
	}, [frame, mode]);

	const filterControls = (
		<RankingsFilters
			availableYears={availableYears}
			yearFilter={yearFilter}
			onYearFilterChange={onYearFilterChange}
			frame={frame}
			onFrameChange={setFrame}
			mode={mode}
			onModeChange={setMode}
		/>
	);

	const filtersSheet = (
		<Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
			<SheetContent
				id="rankings-filters-sheet"
				side="right"
				className="w-[17rem] gap-0"
			>
				<SheetHeader>
					<SheetTitle className="font-[family-name:var(--font-display)] text-lg">
						Filters
					</SheetTitle>
					<SheetDescription>
						Frame your year scoreboard and switch modes.
					</SheetDescription>
				</SheetHeader>
				<div className="flex flex-col gap-4 px-4 pb-6">{filterControls}</div>
			</SheetContent>
		</Sheet>
	);

	if (isLoading) {
		return (
			<div className="xl:flex xl:max-w-full xl:items-stretch xl:gap-8">
				<div className="w-full min-w-0 max-w-xl md:max-w-2xl xl:w-2xl xl:shrink-0">
					<div className="flex flex-col gap-1">
						{Array.from({ length: 8 }).map((_, i) => (
							<RankingBoardRowSkeleton
								key={i}
								band={i === 0 ? "hero" : i < 3 ? "podium" : "top50"}
							/>
						))}
					</div>
				</div>
				<aside className="hidden w-48 shrink-0 xl:block">
					<div className="border-border/40 border-l py-0.5 pl-5 xl:sticky xl:top-[calc(3.5rem+var(--albums-sticky-inset,0px))]">
						<p className="mb-4 font-semibold text-[0.65rem] text-foreground/70 uppercase tracking-[0.16em]">
							Filters
						</p>
						{filterControls}
					</div>
				</aside>
			</div>
		);
	}

	const albumIdToIndex = new Map<string, number>();
	visibleAlbums.forEach((a, i) => albumIdToIndex.set(a._id, i));

	const listHeader = (
		<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
			<div className="xl:hidden">
				<Button
					type="button"
					variant="outline"
					size="sm"
					aria-expanded={filtersOpen}
					aria-controls="rankings-filters-sheet"
					onClick={() => setFiltersOpen(true)}
				>
					<SlidersHorizontal className="h-4 w-4" />
					Filters
				</Button>
			</div>
			<div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
				<h1 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
					{yearIsAll ? "All years" : yearFilter}
				</h1>
				<span className="text-muted-foreground text-xs tabular-nums">
					{visibleAlbums.length}
					{frame === "top" && rankedAlbums.length > 65
						? ` of ${rankedAlbums.length}`
						: ""}{" "}
					{visibleAlbums.length === 1 ? "album" : "albums"}
				</span>
			</div>
			{isReorderingEnabled ? (
				<div className="hidden items-center gap-2 text-muted-foreground text-xs sm:flex">
					<KbdGroup>
						<Kbd>
							<ArrowUp className="h-3 w-3" />
						</Kbd>
						<Kbd>
							<ArrowDown className="h-3 w-3" />
						</Kbd>
					</KbdGroup>
					<span>Select</span>
					<span>•</span>
					<KbdGroup>
						<Kbd>⌥</Kbd>
						<span>+</span>
						<Kbd>
							<ArrowUp className="h-3 w-3" />
						</Kbd>
						<Kbd>
							<ArrowDown className="h-3 w-3" />
						</Kbd>
					</KbdGroup>
					<span>Move</span>
					<span>•</span>
					<KbdGroup>
						<Kbd>Esc</Kbd>
					</KbdGroup>
					<span>Clear</span>
				</div>
			) : null}
		</div>
	);

	const wowHint = showWowHint ? (
		<p className="mb-3 text-[11px] text-muted-foreground/65 leading-snug">
			WoW signals appear after Sunday&apos;s snapshot
		</p>
	) : null;

	function renderBoardList(): ReactNode {
		if (visibleAlbums.length === 0) {
			return (
				<div className="flex h-64 items-center justify-center rounded-lg border border-dashed">
					<div className="text-center">
						<Disc3 className="mx-auto h-12 w-12 text-muted-foreground/50" />
						<p className="mt-4 text-muted-foreground">
							No rated albums for {yearIsAll ? "any year" : yearFilter}
						</p>
						<p className="mt-1 text-muted-foreground text-sm">
							Rate albums to build this year&apos;s scoreboard
						</p>
					</div>
				</div>
			);
		}

		return (
			<div className="flex flex-col gap-8">
				<BoardSegment
					albums={framed.top50}
					albumIdToIndex={albumIdToIndex}
					selectedIndex={selectedIndex}
					selectedRowRef={selectedRowRef}
					savedAlbumId={savedAlbumId}
					isReorderingEnabled={isReorderingEnabled}
					onSelect={setSelectedIndex}
					showTierRunner
					previousAlbum={null}
					wowEnabled={wowEnabled}
					priorOrdinals={priorOrdinals}
				/>

				{framed.edge51to65.length > 0 ? (
					<section className="relative rounded-md border border-border/50 bg-slate-50/40 px-2 py-3 dark:bg-slate-950/20">
						<div className="mb-2 flex items-baseline gap-2 px-1.5">
							<p className="font-[family-name:var(--font-display)] text-muted-foreground text-sm tracking-tight">
								On the edge
							</p>
							<span className="text-[11px] text-muted-foreground/70">
								#51–65
							</span>
						</div>
						<BoardSegment
							albums={framed.edge51to65}
							albumIdToIndex={albumIdToIndex}
							selectedIndex={selectedIndex}
							selectedRowRef={selectedRowRef}
							savedAlbumId={savedAlbumId}
							isReorderingEnabled={isReorderingEnabled}
							onSelect={setSelectedIndex}
							showTierRunner
							previousAlbum={framed.top50[framed.top50.length - 1] ?? null}
							wowEnabled={wowEnabled}
							priorOrdinals={priorOrdinals}
						/>
					</section>
				) : null}

				{framed.rest.length > 0 ? (
					<section>
						<div className="mb-2 flex items-baseline gap-2">
							<p className="font-[family-name:var(--font-display)] text-muted-foreground text-sm tracking-tight">
								Full year
							</p>
							<span className="text-[11px] text-muted-foreground/70">
								#{framed.rest[0]?.ordinal}–
								{framed.rest[framed.rest.length - 1]?.ordinal}
							</span>
						</div>
						<BoardSegment
							albums={framed.rest}
							albumIdToIndex={albumIdToIndex}
							selectedIndex={selectedIndex}
							selectedRowRef={selectedRowRef}
							savedAlbumId={savedAlbumId}
							isReorderingEnabled={isReorderingEnabled}
							onSelect={setSelectedIndex}
							showTierRunner
							previousAlbum={
								framed.edge51to65[framed.edge51to65.length - 1] ??
								framed.top50[framed.top50.length - 1] ??
								null
							}
							wowEnabled={wowEnabled}
							priorOrdinals={priorOrdinals}
						/>
					</section>
				) : null}
			</div>
		);
	}

	const showDuelArena =
		mode === "duel" &&
		!yearIsAll &&
		yearNumber !== null &&
		!Number.isNaN(yearNumber) &&
		userId !== null;

	return (
		<>
			<div className="xl:flex xl:max-w-full xl:items-stretch xl:gap-8">
				<div
					className={cn(
						"w-full min-w-0 xl:shrink-0",
						showDuelArena
							? "max-w-3xl md:max-w-4xl xl:max-w-5xl"
							: "max-w-xl md:max-w-2xl xl:w-2xl",
					)}
				>
					{listHeader}
					{mode === "board" ? wowHint : null}

					{mode === "duel" ? (
						showDuelArena && userId !== null && yearNumber !== null ? (
							<RankingsDuelArena userId={userId} year={yearNumber} />
						) : (
							<div className="flex h-72 flex-col items-center justify-center gap-2 rounded-lg border border-border/70 border-dashed bg-slate-50/40 px-6 text-center dark:bg-slate-950/20">
								<p className="font-[family-name:var(--font-display)] text-lg tracking-tight">
									Pick a year to duel
								</p>
								<p className="max-w-xs text-muted-foreground text-sm leading-snug">
									Reorder, duel, and week-over-week need a concrete year.
								</p>
							</div>
						)
					) : (
						renderBoardList()
					)}
				</div>

				<aside className="hidden w-48 shrink-0 xl:block">
					<div className="max-h-[calc(100vh-3.5rem-var(--albums-sticky-inset,0px))] overflow-y-auto overscroll-contain border-border/40 border-l py-0.5 pl-5 xl:sticky xl:top-[calc(3.5rem+var(--albums-sticky-inset,0px))] xl:z-10">
						<p className="mb-4 font-semibold text-[0.65rem] text-foreground/70 uppercase tracking-[0.16em]">
							Filters
						</p>
						{filterControls}
					</div>
				</aside>
			</div>
			{filtersSheet}
		</>
	);
}

function BoardSegment({
	albums,
	albumIdToIndex,
	selectedIndex,
	selectedRowRef,
	savedAlbumId,
	isReorderingEnabled,
	onSelect,
	showTierRunner,
	previousAlbum,
	wowEnabled,
	priorOrdinals,
}: {
	albums: Array<RankedAlbumItem & { ordinal: number }>;
	albumIdToIndex: Map<string, number>;
	selectedIndex: number | null;
	selectedRowRef: RefObject<HTMLDivElement | null>;
	savedAlbumId: string | null;
	isReorderingEnabled: boolean;
	onSelect: (index: number) => void;
	showTierRunner: boolean;
	previousAlbum: (RankedAlbumItem & { ordinal: number }) | null;
	wowEnabled: boolean;
	priorOrdinals: Map<string, number> | null;
}): ReactNode {
	if (albums.length === 0) return null;

	const nodes: ReactNode[] = [];
	let currentDecade: string | null = null;
	let prevTier: TierName | null = previousAlbum?.rating
		? (getTierInfo(previousAlbum.rating)?.tier ?? null)
		: null;

	for (let i = 0; i < albums.length; i++) {
		const album = albums[i];
		if (!album) continue;

		const decade = decadeLabel(album.ordinal);
		if (decade !== currentDecade) {
			currentDecade = decade;
			nodes.push(
				<div
					key={`decade-${decade}-${album.ordinal}`}
					className="-mx-1 sticky top-[calc(3.5rem+var(--albums-sticky-inset,0px))] z-[1] bg-background/90 px-1 pt-3 pb-1 backdrop-blur-sm first:pt-0"
					style={{
						animation: `home-rise 420ms ease-out ${Math.min(i * 20, 120)}ms both`,
					}}
				>
					<div className="flex items-end gap-3 border-border/50 border-b pb-1">
						<h2 className="font-[family-name:var(--font-display)] text-foreground/90 text-lg tracking-tight">
							{decade}
						</h2>
						<Separator className="mb-1.5 flex-1 opacity-40" />
					</div>
				</div>,
			);
		}

		if (showTierRunner && album.rating) {
			const tier = getTierInfo(album.rating)?.tier ?? null;
			if (tier && prevTier !== null && tier !== prevTier) {
				nodes.push(
					<div
						key={`tier-${tier}-${album._id}`}
						className="relative h-0 overflow-visible"
					>
						<span className="-top-2 absolute left-10 z-[1] bg-background px-1 font-medium text-[0.6rem] text-muted-foreground/75 uppercase tracking-[0.12em]">
							from here down: {tier}
						</span>
					</div>,
				);
			}
			if (tier) prevTier = tier;
		}

		const flatIdx = albumIdToIndex.get(album._id);
		const isSelected = flatIdx === selectedIndex;
		const releaseYear = album.album?.releaseDate?.substring(0, 4);

		nodes.push(
			<RankingBoardRow
				key={album._id}
				ref={isSelected ? selectedRowRef : undefined}
				ordinal={album.ordinal}
				name={album.album?.name ?? "Unknown Album"}
				artistName={album.album?.artistName ?? "Unknown Artist"}
				imageUrl={album.album?.imageUrl}
				releaseYear={releaseYear}
				listenCount={album.listenCount}
				rating={album.rating}
				isSelected={isSelected}
				showSaved={album._id === savedAlbumId}
				staggerIndex={album.ordinal <= 10 ? album.ordinal - 1 : undefined}
				wowSlot={renderWowSlot({
					album,
					wowEnabled,
					priorOrdinals,
				})}
				onSelect={
					isReorderingEnabled && flatIdx !== undefined
						? () => onSelect(flatIdx)
						: undefined
				}
			/>,
		);
	}

	return <div className="flex flex-col gap-0.5">{nodes}</div>;
}

function renderWowSlot({
	album,
	wowEnabled,
	priorOrdinals,
}: {
	album: RankedAlbumItem & { ordinal: number };
	wowEnabled: boolean;
	priorOrdinals: Map<string, number> | null;
}): ReactNode {
	if (!wowEnabled || !priorOrdinals) return null;

	const priorOrdinal = priorOrdinals.get(album._id) ?? null;
	const signal = wowSignals({
		currentOrdinal: album.ordinal,
		priorOrdinal,
		priorInTop50: priorOrdinal !== null && priorOrdinal <= 50,
	});

	if (!signal) return null;
	return <WowChip signal={signal} />;
}

function WowChip({ signal }: { signal: NonNullable<WowSignal> }): ReactNode {
	if (signal.kind === "new") {
		return (
			<Badge
				className="h-4 rounded-[3px] border-transparent bg-teal-600 px-1 py-0 font-semibold text-[8px] text-white uppercase tracking-[0.14em] hover:bg-teal-600"
				aria-label="New to Top 50"
			>
				New
			</Badge>
		);
	}

	const movedUp = signal.delta > 0;
	return (
		<span
			className={cn(
				"font-medium text-[10px] tabular-nums",
				movedUp
					? "text-teal-700/90 dark:text-teal-400/90"
					: "text-muted-foreground/65",
			)}
			aria-label={
				movedUp
					? `Up ${signal.delta} spots since last Sunday`
					: `Down ${Math.abs(signal.delta)} spots since last Sunday`
			}
		>
			{movedUp ? `↑${signal.delta}` : `↓${Math.abs(signal.delta)}`}
		</span>
	);
}
