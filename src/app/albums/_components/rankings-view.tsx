"use client";

import { ArrowDown, ArrowUp, Disc3 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Kbd, KbdGroup } from "~/components/ui/kbd";
import {
	TIER_ORDER,
	type TierName,
	getRatingsForTier,
} from "~/lib/album-tiers";
import { useDebouncedCallback } from "~/lib/hooks/use-debounced-callback";
import type { RankedAlbumItem } from "../_utils/types";
import { AlbumCard } from "./album-card";

type RankingsViewProps = {
	albumsByTier: Map<TierName, { high: RankedAlbumItem[]; med: RankedAlbumItem[]; low: RankedAlbumItem[] }>;
	availableYears: number[];
	yearFilter: string;
	onYearFilterChange: (year: string) => void;
	isLoading: boolean;
	onUpdateRating: (userAlbumId: string, rating: number, position: number) => void;
};

export function RankingsView({
	albumsByTier,
	availableYears,
	yearFilter,
	onYearFilterChange,
	isLoading,
	onUpdateRating,
}: RankingsViewProps) {
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
	const [optimisticUpdates, setOptimisticUpdates] = useState<
		Map<string, { rating: number; position: number }>
	>(new Map());
	const [savedAlbumId, setSavedAlbumId] = useState<string | null>(null);
	const [scrollTrigger, setScrollTrigger] = useState(0);
	const selectedRowRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Debounced mutation - waits 800ms after last change before persisting
	const debouncedUpdate = useDebouncedCallback(
		(userAlbumId: string, rating: number, position: number) => {
			onUpdateRating(userAlbumId, rating, position);
			setSavedAlbumId(userAlbumId);
			if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
			savedTimeoutRef.current = setTimeout(() => setSavedAlbumId(null), 1500);
		},
		800,
	);

	// Flatten albums into a single ordered list for keyboard navigation
	const flatAlbums = useMemo(() => {
		const allAlbums: RankedAlbumItem[] = [];
		for (const tier of TIER_ORDER) {
			const tierData = albumsByTier.get(tier);
			if (!tierData) continue;
			allAlbums.push(...tierData.high, ...tierData.med, ...tierData.low);
		}

		// Apply optimistic updates
		const withOptimistic = allAlbums.map((a) => {
			const update = optimisticUpdates.get(a._id);
			if (update) {
				return { ...a, rating: update.rating, position: update.position };
			}
			return a;
		});

		// Sort by rating (descending) then position (ascending)
		return withOptimistic.sort((a, b) => {
			const ratingA = a.rating ?? 0;
			const ratingB = b.rating ?? 0;
			if (ratingA !== ratingB) return ratingB - ratingA;
			return (a.position ?? 0) - (b.position ?? 0);
		});
	}, [albumsByTier, optimisticUpdates]);

	// Re-group for display (respecting optimistic updates)
	const displayByTier = useMemo(() => {
		const grouped = new Map<
			TierName,
			{ high: RankedAlbumItem[]; med: RankedAlbumItem[]; low: RankedAlbumItem[] }
		>();
		for (const tier of TIER_ORDER) {
			const { high: highRating, med: medRating, low: lowRating } = getRatingsForTier(tier);
			grouped.set(tier, {
				high: flatAlbums.filter((a) => a.rating === highRating),
				med: flatAlbums.filter((a) => a.rating === medRating),
				low: flatAlbums.filter((a) => a.rating === lowRating),
			});
		}
		return grouped;
	}, [flatAlbums]);

	// Check if keyboard reordering is enabled (only for specific years)
	const isReorderingEnabled = yearFilter !== "all";

	// Move album to a new position
	const moveAlbum = useCallback(
		(direction: "up" | "down") => {
			if (selectedIndex === null || !isReorderingEnabled) return;
			const album = flatAlbums[selectedIndex];
			if (!album) return;

			const currentRating = album.rating ?? 8;
			const currentPosition = album.position ?? 0;

			// Find albums in the same rating tier
			const albumsInSameTier = flatAlbums.filter(
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

					const newFlatIndex = flatAlbums.findIndex(
						(a) => a._id === albumAbove._id,
					);
					newSelectedIndex = newFlatIndex >= 0 ? newFlatIndex : selectedIndex;
				} else {
					if (currentRating >= 15) return;

					newRating = currentRating + 1;

					const albumsInNewTier = flatAlbums.filter(
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

					const newFlatIndex = flatAlbums.findIndex(
						(a) => a._id === albumBelow._id,
					);
					newSelectedIndex = newFlatIndex >= 0 ? newFlatIndex : selectedIndex;
				} else {
					if (currentRating <= 1) return;

					newRating = currentRating - 1;

					const albumsInNewTier = flatAlbums.filter(
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
		[selectedIndex, flatAlbums, isReorderingEnabled, debouncedUpdate],
	);

	// Keyboard handler
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
						if (prev === null) return flatAlbums.length > 0 ? 0 : null;
						const next = e.key === "ArrowUp" ? prev - 1 : prev + 1;
						if (next < 0 || next >= flatAlbums.length) return prev;
						return next;
					});
				}
			} else if (e.key === "Escape") {
				setSelectedIndex(null);
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isReorderingEnabled, flatAlbums.length, moveAlbum]);

	// Scroll selected album into view
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

	// Reset selection when year filter changes
	useEffect(() => {
		setSelectedIndex(null);
		setOptimisticUpdates(new Map());
	}, [yearFilter]);

	if (isLoading) {
		return (
			<div className="flex h-64 items-center justify-center">
				<p className="text-muted-foreground">Loading rankings...</p>
			</div>
		);
	}

	const hasRatedAlbums = flatAlbums.length > 0;

	if (!hasRatedAlbums) {
		return (
			<div className="flex h-64 items-center justify-center rounded-lg border border-dashed">
				<div className="text-center">
					<Disc3 className="mx-auto h-12 w-12 text-muted-foreground/50" />
					<p className="mt-4 text-muted-foreground">No rated albums yet</p>
					<p className="mt-1 text-muted-foreground text-sm">
						Rate albums to see them organized by tier
					</p>
				</div>
			</div>
		);
	}

	const albumIdToIndex = new Map<string, number>();
	flatAlbums.forEach((a, i) => albumIdToIndex.set(a._id, i));

	return (
		<div ref={containerRef} className="space-y-2">
			{/* Year Filter + Keyboard hint */}
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-3">
					<label
						htmlFor="year-filter"
						className="text-muted-foreground text-sm"
					>
						Filter by year:
					</label>
					<select
						id="year-filter"
						value={yearFilter}
						onChange={(e) => onYearFilterChange(e.target.value)}
						className="rounded-md border bg-background px-3 py-1.5 text-sm"
					>
						<option value="all">All Years</option>
						{availableYears.map((year) => (
							<option key={year} value={year.toString()}>
								{year}
							</option>
						))}
					</select>
				</div>
				<span className="text-muted-foreground text-sm">
					{flatAlbums.length} albums
				</span>
				{isReorderingEnabled && (
					<div className="flex items-center gap-2 text-muted-foreground text-xs">
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
				)}
			</div>

			{/* Tier Sections */}
			{TIER_ORDER.map((tier) => {
				const albums = displayByTier.get(tier) ?? { high: [], med: [], low: [] };

				return (
					<div key={tier} className="rounded-lg border p-2">
						<h2 className="mb-1.5 font-semibold text-base">{tier}</h2>

						<div className="mb-1.5">
							<h3 className="mb-0.5 font-medium text-muted-foreground text-sm">
								High
								{albums.high.length > 0 && (
									<span className="ml-1">({albums.high.length})</span>
								)}
							</h3>
							<div className="space-y-0.5">
								{albums.high.length > 0 ? (
									albums.high.map((ua) => {
										const flatIdx = albumIdToIndex.get(ua._id);
										const isSelected = flatIdx === selectedIndex;
										return (
											<AlbumCard
												key={ua._id}
												ref={isSelected ? selectedRowRef : undefined}
												name={ua.album?.name ?? "Unknown Album"}
												artistName={ua.album?.artistName ?? "Unknown Artist"}
												imageUrl={ua.album?.imageUrl}
												releaseDate={ua.album?.releaseDate}
												showReleaseYear
												isSelected={isSelected}
												showSaved={ua._id === savedAlbumId}
												onSelect={
													isReorderingEnabled && flatIdx !== undefined
														? () => setSelectedIndex(flatIdx)
														: undefined
												}
											/>
										);
									})
								) : (
									<div className="rounded-md border border-dashed py-1.5 text-center text-muted-foreground/50 text-xs">
										Empty
									</div>
								)}
							</div>
						</div>

						<div className="mb-1.5">
							<h3 className="mb-0.5 font-medium text-muted-foreground text-sm">
								Med
								{albums.med.length > 0 && (
									<span className="ml-1">({albums.med.length})</span>
								)}
							</h3>
							<div className="space-y-0.5">
								{albums.med.length > 0 ? (
									albums.med.map((ua) => {
										const flatIdx = albumIdToIndex.get(ua._id);
										const isSelected = flatIdx === selectedIndex;
										return (
											<AlbumCard
												key={ua._id}
												ref={isSelected ? selectedRowRef : undefined}
												name={ua.album?.name ?? "Unknown Album"}
												artistName={ua.album?.artistName ?? "Unknown Artist"}
												imageUrl={ua.album?.imageUrl}
												releaseDate={ua.album?.releaseDate}
												showReleaseYear
												isSelected={isSelected}
												showSaved={ua._id === savedAlbumId}
												onSelect={
													isReorderingEnabled && flatIdx !== undefined
														? () => setSelectedIndex(flatIdx)
														: undefined
												}
											/>
										);
									})
								) : (
									<div className="rounded-md border border-dashed py-1.5 text-center text-muted-foreground/50 text-xs">
										Empty
									</div>
								)}
							</div>
						</div>

						<div>
							<h3 className="mb-0.5 font-medium text-muted-foreground text-sm">
								Low
								{albums.low.length > 0 && (
									<span className="ml-1">({albums.low.length})</span>
								)}
							</h3>
							<div className="space-y-0.5">
								{albums.low.length > 0 ? (
									albums.low.map((ua) => {
										const flatIdx = albumIdToIndex.get(ua._id);
										const isSelected = flatIdx === selectedIndex;
										return (
											<AlbumCard
												key={ua._id}
												ref={isSelected ? selectedRowRef : undefined}
												name={ua.album?.name ?? "Unknown Album"}
												artistName={ua.album?.artistName ?? "Unknown Artist"}
												imageUrl={ua.album?.imageUrl}
												releaseDate={ua.album?.releaseDate}
												showReleaseYear
												isSelected={isSelected}
												showSaved={ua._id === savedAlbumId}
												onSelect={
													isReorderingEnabled && flatIdx !== undefined
														? () => setSelectedIndex(flatIdx)
														: undefined
												}
											/>
										);
									})
								) : (
									<div className="rounded-md border border-dashed py-1.5 text-center text-muted-foreground/50 text-xs">
										Empty
									</div>
								)}
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}
