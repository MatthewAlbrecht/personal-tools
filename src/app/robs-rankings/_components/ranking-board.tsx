"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Kbd, KbdGroup } from "~/components/ui/kbd";
import { useDebouncedCallback } from "~/lib/hooks/use-debounced-callback";
import {
	BUCKETS,
	type RankingAlbum,
	type RankingStatus,
	getBucketForPosition,
} from "../_utils/types";
import { RankingAlbumCard } from "./ranking-album-card";

type RankingBoardProps = {
	albums: RankingAlbum[];
	onUpdatePosition: (rankingAlbumId: string, newPosition: number) => void;
	onUpdateStatus: (rankingAlbumId: string, status: string) => void;
};

export function RankingBoard({
	albums,
	onUpdatePosition,
	onUpdateStatus,
}: RankingBoardProps) {
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
	const [optimisticUpdates, setOptimisticUpdates] = useState<
		Map<string, { position: number; status?: RankingStatus }>
	>(new Map());
	const selectedRowRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	// Debounced position update - waits 800ms after last change before persisting
	const debouncedPositionUpdate = useDebouncedCallback(
		(rankingAlbumId: string, newPosition: number) => {
			onUpdatePosition(rankingAlbumId, newPosition);
		},
		800,
	);

	// Apply optimistic updates to albums
	const displayAlbums = useMemo(() => {
		return albums
			.map((album) => {
				const update = optimisticUpdates.get(album._id);
				if (update) {
					return {
						...album,
						position: update.position,
						status: update.status ?? album.status,
					};
				}
				return album;
			})
			.sort((a, b) => a.position - b.position);
	}, [albums, optimisticUpdates]);

	// Find next available position in a direction, skipping confirmed albums
	// Also checks if target album is locked and would be displaced out of its bucket
	const findNextAvailablePosition = useCallback(
		(
			currentPos: number,
			direction: "up" | "down",
			currentAlbum: RankingAlbum,
		): number | null => {
			const step = direction === "up" ? -1 : 1;
			let targetPos = currentPos + step;

			// Check bucket constraints for locked albums
			const currentBucket = getBucketForPosition(currentPos);

			while (targetPos >= 1 && targetPos <= displayAlbums.length) {
				const targetAlbum = displayAlbums.find((a) => a.position === targetPos);

				// If target is confirmed, skip it
				if (targetAlbum?.status === "confirmed") {
					targetPos += step;
					continue;
				}

				// If current album is locked, check bucket constraints
				if (currentAlbum.status === "locked" && currentBucket) {
					const targetBucket = getBucketForPosition(targetPos);
					if (!targetBucket || targetBucket.label !== currentBucket.label) {
						return null; // Can't move outside bucket
					}
				}

				// If target album is locked, check if swapping would displace it out of its bucket
				if (targetAlbum?.status === "locked") {
					const targetBucket = getBucketForPosition(targetPos);
					const swapToBucket = getBucketForPosition(currentPos);
					if (
						targetBucket &&
						swapToBucket &&
						targetBucket.label !== swapToBucket.label
					) {
						// Can't swap - would displace locked album out of its bucket
						// Skip this album and continue looking
						targetPos += step;
						continue;
					}
				}

				return targetPos;
			}

			return null;
		},
		[displayAlbums],
	);

	// Move album
	const moveAlbum = useCallback(
		(direction: "up" | "down") => {
			if (selectedIndex === null) return;

			const album = displayAlbums[selectedIndex];
			if (!album) return;

			// Can't move confirmed albums
			if (album.status === "confirmed") return;

			const newPosition = findNextAvailablePosition(
				album.position,
				direction,
				album,
			);
			if (newPosition === null) return;

		const targetAlbum = displayAlbums.find((a) => a.position === newPosition);

		// Optimistic swap - update both albums' positions
		setOptimisticUpdates((prev) => {
			const next = new Map(prev);
			next.set(album._id, {
				position: newPosition,
				status: album.status,
			});
			if (targetAlbum) {
				next.set(targetAlbum._id, {
					position: album.position,
					status: targetAlbum.status,
				});
			}
			return next;
		});

		// Update selected index to follow the moved album to its new position
		// We need to find what index corresponds to newPosition after the swap
		// Since we're swapping, the album will be at the index where targetAlbum currently is
		const targetIndex = displayAlbums.findIndex(
			(a) => a.position === newPosition,
		);
		if (targetIndex !== -1) {
			setSelectedIndex(targetIndex);
		} else if (direction === "up") {
			setSelectedIndex(Math.max(0, selectedIndex - 1));
		} else {
			setSelectedIndex(Math.min(displayAlbums.length - 1, selectedIndex + 1));
		}

		// Debounced persist - only fires after motion stops
		debouncedPositionUpdate(album._id, newPosition);
	},
	[
		selectedIndex,
		displayAlbums,
		findNextAvailablePosition,
		debouncedPositionUpdate,
	],
);

	// Toggle status
	const toggleConfirmed = useCallback(() => {
		if (selectedIndex === null) return;
		const album = displayAlbums[selectedIndex];
		if (!album) return;

		const newStatus = album.status === "confirmed" ? "none" : "confirmed";
		setOptimisticUpdates((prev) => {
			const next = new Map(prev);
			next.set(album._id, { position: album.position, status: newStatus });
			return next;
		});
		onUpdateStatus(album._id, newStatus);
	}, [selectedIndex, displayAlbums, onUpdateStatus]);

	const toggleLocked = useCallback(() => {
		if (selectedIndex === null) return;
		const album = displayAlbums[selectedIndex];
		if (!album) return;

		// Can't lock a confirmed album
		if (album.status === "confirmed") return;

		const newStatus = album.status === "locked" ? "none" : "locked";
		setOptimisticUpdates((prev) => {
			const next = new Map(prev);
			next.set(album._id, { position: album.position, status: newStatus });
			return next;
		});
		onUpdateStatus(album._id, newStatus);
	}, [selectedIndex, displayAlbums, onUpdateStatus]);

	// Keyboard handler
	useEffect(() => {
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
						if (prev === null) return displayAlbums.length > 0 ? 0 : null;
						const next = e.key === "ArrowUp" ? prev - 1 : prev + 1;
						if (next < 0 || next >= displayAlbums.length) return prev;
						return next;
					});
				}
			} else if (e.key === "ArrowLeft") {
				e.preventDefault();
				toggleConfirmed();
			} else if (e.key === "ArrowRight") {
				e.preventDefault();
				toggleLocked();
			} else if (e.key === "Escape") {
				setSelectedIndex(null);
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [displayAlbums.length, moveAlbum, toggleConfirmed, toggleLocked]);

	// Scroll selected into view
	// biome-ignore lint/correctness/useExhaustiveDependencies: selectedIndex change triggers scroll
	useEffect(() => {
		const el = selectedRowRef.current;
		if (!el) return;

		const padding = 100;
		const elRect = el.getBoundingClientRect();

		if (elRect.top < padding) {
			window.scrollBy({ top: elRect.top - padding, behavior: "smooth" });
		} else if (elRect.bottom > window.innerHeight - padding) {
			window.scrollBy({
				top: elRect.bottom - window.innerHeight + padding,
				behavior: "smooth",
			});
		}
	}, [selectedIndex]);

	// Group albums by bucket
	const albumsByBucket = useMemo(() => {
		const groups = new Map<string, RankingAlbum[]>();
		for (const bucket of BUCKETS) {
			groups.set(
				bucket.label,
				displayAlbums.filter(
					(a) => a.position >= bucket.start && a.position <= bucket.end,
				),
			);
		}
		return groups;
	}, [displayAlbums]);

	// Create position-to-index map
	const positionToIndex = useMemo(() => {
		const map = new Map<number, number>();
		displayAlbums.forEach((a, idx) => map.set(a.position, idx));
		return map;
	}, [displayAlbums]);

	return (
		<div ref={containerRef} className="space-y-4">
			{/* Header */}
			<div className="flex items-center justify-between">
				<h2 className="font-semibold text-lg">Rank Albums</h2>
			</div>

			{/* Keyboard hints */}
			<div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
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
				<Kbd>←</Kbd>
				<span>Confirm</span>
				<span>•</span>
				<Kbd>→</Kbd>
				<span>Lock to bucket</span>
				<span>•</span>
				<Kbd>Esc</Kbd>
				<span>Deselect</span>
			</div>

			{/* Buckets */}
			<div className="space-y-4">
				{BUCKETS.map((bucket) => {
					const bucketAlbums = albumsByBucket.get(bucket.label) ?? [];

					return (
						<div key={bucket.label} className="rounded-lg border p-3">
							<h3 className="mb-2 font-semibold text-sm">
								{bucket.label}
							</h3>

							{bucketAlbums.length === 0 ? (
								<div className="rounded-md border border-dashed py-4 text-center text-muted-foreground text-sm">
									No albums in this range
								</div>
							) : (
								<div className="space-y-0.5">
									{bucketAlbums.map((album) => {
										const idx = positionToIndex.get(album.position);
										const isSelected = idx === selectedIndex;

										return (
											<RankingAlbumCard
												key={album._id}
												ref={isSelected ? selectedRowRef : undefined}
												position={album.position}
												name={album.album?.name ?? "Unknown"}
												artistName={album.album?.artistName ?? "Unknown"}
												imageUrl={album.album?.imageUrl}
												status={album.status}
												isSelected={isSelected}
												onSelect={
													idx !== undefined
														? () => setSelectedIndex(idx)
														: undefined
												}
											/>
										);
									})}
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
