"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Kbd, KbdGroup } from "~/components/ui/kbd";
import { useDebouncedCallback } from "~/lib/hooks/use-debounced-callback";
import { BUCKETS, type RankingAlbum } from "../_utils/types";
import { RankingAlbumCard } from "./ranking-album-card";

type PositionUpdate = {
	rankingAlbumId: string;
	position: number;
};

type RankingBoardProps = {
	albums: RankingAlbum[];
	onBatchUpdatePositions: (positions: PositionUpdate[]) => void;
	onRemoveAlbum: (rankingAlbumId: string) => void;
};

export function RankingBoard({
	albums,
	onBatchUpdatePositions,
	onRemoveAlbum,
}: RankingBoardProps) {
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
	const [optimisticUpdates, setOptimisticUpdates] = useState<
		Map<string, { position: number }>
	>(new Map());
	const pendingPositionChanges = useRef<Map<string, number>>(new Map());
	const selectedRowRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	const debouncedBatchSave = useDebouncedCallback(() => {
		if (pendingPositionChanges.current.size === 0) return;

		const positions: PositionUpdate[] = [];
		pendingPositionChanges.current.forEach((position, rankingAlbumId) => {
			positions.push({ rankingAlbumId, position });
		});

		onBatchUpdatePositions(positions);
		pendingPositionChanges.current.clear();
	}, 800);

	const displayAlbums = useMemo(() => {
		return albums
			.map((album) => {
				const update = optimisticUpdates.get(album._id);
				if (update) {
					return { ...album, position: update.position };
				}
				return album;
			})
			.sort((a, b) => a.position - b.position);
	}, [albums, optimisticUpdates]);

	const moveAlbum = useCallback(
		(direction: "up" | "down") => {
			if (selectedIndex === null) return;

			const album = displayAlbums[selectedIndex];
			if (!album) return;

			const step = direction === "up" ? -1 : 1;
			const newPosition = album.position + step;
			if (newPosition < 1 || newPosition > displayAlbums.length) return;

			const targetAlbum = displayAlbums.find((a) => a.position === newPosition);
			if (!targetAlbum) return;

			setOptimisticUpdates((prev) => {
				const next = new Map(prev);
				next.set(album._id, { position: newPosition });
				next.set(targetAlbum._id, { position: album.position });
				return next;
			});

			pendingPositionChanges.current.set(album._id, newPosition);
			pendingPositionChanges.current.set(targetAlbum._id, album.position);

			const targetIndex = displayAlbums.findIndex(
				(a) => a.position === newPosition,
			);
			if (targetIndex !== -1) {
				setSelectedIndex(targetIndex);
			}

			debouncedBatchSave();
		},
		[selectedIndex, displayAlbums, debouncedBatchSave],
	);

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
			} else if (e.key === "Escape") {
				setSelectedIndex(null);
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [displayAlbums.length, moveAlbum]);

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

	const positionToIndex = useMemo(() => {
		const map = new Map<number, number>();
		displayAlbums.forEach((a, idx) => map.set(a.position, idx));
		return map;
	}, [displayAlbums]);

	return (
		<div ref={containerRef} className="space-y-4">
			<div className="flex items-center justify-between">
				<h2 className="font-semibold text-lg">Top 50 List</h2>
				<span className="text-muted-foreground text-sm">
					{displayAlbums.length}/50 albums
				</span>
			</div>

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
				<Kbd>Esc</Kbd>
				<span>Deselect</span>
			</div>

			<div className="space-y-4">
				{BUCKETS.map((bucket) => {
					const bucketAlbums = albumsByBucket.get(bucket.label) ?? [];

					return (
						<div key={bucket.label} className="rounded-lg border p-3">
							<h3 className="mb-2 font-semibold text-sm">{bucket.label}</h3>

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
												isSelected={isSelected}
												onSelect={
													idx !== undefined
														? () => setSelectedIndex(idx)
														: undefined
												}
												onRemove={() => onRemoveAlbum(album._id)}
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
