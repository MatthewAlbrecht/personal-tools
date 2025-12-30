"use client";

import { Disc3 } from "lucide-react";
import Image from "next/image";
import { forwardRef, useEffect, useRef, useState } from "react";
import { Kbd, KbdGroup } from "~/components/ui/kbd";
import { cn } from "~/lib/utils";
import type { AvailableAlbum, RankingAlbum } from "../_utils/types";

type AlbumPickerProps = {
	availableAlbums: AvailableAlbum[];
	selectedAlbums: RankingAlbum[];
	year: number;
	onAddAlbum: (albumId: string) => void;
	onRemoveAlbum: (rankingAlbumId: string) => void;
	onDone: () => void;
};

export function AlbumPicker({
	availableAlbums,
	selectedAlbums,
	year,
	onAddAlbum,
	onRemoveAlbum,
	onDone,
}: AlbumPickerProps) {
	const [activeColumn, setActiveColumn] = useState<"available" | "selected">(
		"available",
	);
	const [availableIndex, setAvailableIndex] = useState(0);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [searchQuery, setSearchQuery] = useState("");
	const [filterByYear, setFilterByYear] = useState(true);
	const [filterMinTracks, setFilterMinTracks] = useState(true);

	const availableListRef = useRef<HTMLDivElement>(null);
	const selectedListRef = useRef<HTMLDivElement>(null);
	const selectedRowRef = useRef<HTMLDivElement>(null);
	const availableRowRef = useRef<HTMLDivElement>(null);

	// Filter available albums by search, year, and track count
	const filteredAvailable = availableAlbums.filter((album) => {
		// Year filter
		if (filterByYear && album.releaseDate) {
			const releaseYear = new Date(album.releaseDate).getFullYear();
			if (releaseYear !== year) {
				return false;
			}
		}

		// Track count filter - exclude albums with 3 or fewer tracks
		if (filterMinTracks && album.totalTracks <= 3) {
			return false;
		}

		// Search filter
		if (!searchQuery) return true;
		const query = searchQuery.toLowerCase();
		return (
			album.name.toLowerCase().includes(query) ||
			album.artistName.toLowerCase().includes(query)
		);
	});

	// Keyboard handler
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement
			) {
				// Allow escape to blur input
				if (e.key === "Escape") {
					(e.target as HTMLElement).blur();
				}
				return;
			}

			const currentList =
				activeColumn === "available" ? filteredAvailable : selectedAlbums;
			const currentIndex =
				activeColumn === "available" ? availableIndex : selectedIndex;
			const setIndex =
				activeColumn === "available" ? setAvailableIndex : setSelectedIndex;

			if (e.key === "ArrowUp") {
				e.preventDefault();
				setIndex(Math.max(0, currentIndex - 1));
			} else if (e.key === "ArrowDown") {
				e.preventDefault();
				setIndex(Math.min(currentList.length - 1, currentIndex + 1));
			} else if (e.key === "ArrowLeft") {
				e.preventDefault();
				setActiveColumn("available");
			} else if (e.key === "ArrowRight") {
				e.preventDefault();
				setActiveColumn("selected");
			} else if (e.key === "Enter") {
				e.preventDefault();
				if (activeColumn === "available" && filteredAvailable[availableIndex]) {
					const album = filteredAvailable[availableIndex];
					if (album && selectedAlbums.length < 50) {
						onAddAlbum(album._id);
					}
				} else if (
					activeColumn === "selected" &&
					selectedAlbums[selectedIndex]
				) {
					const album = selectedAlbums[selectedIndex];
					if (album) {
						onRemoveAlbum(album._id);
						setSelectedIndex(Math.max(0, selectedIndex - 1));
					}
				}
			} else if (e.key === "Escape") {
				if (selectedAlbums.length === 50) {
					onDone();
				}
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [
		activeColumn,
		availableIndex,
		selectedIndex,
		filteredAvailable,
		selectedAlbums,
		onAddAlbum,
		onRemoveAlbum,
		onDone,
	]);

	// Scroll selected item into view
	// biome-ignore lint/correctness/useExhaustiveDependencies: index changes trigger scroll
	useEffect(() => {
		const ref = activeColumn === "available" ? availableRowRef : selectedRowRef;
		const container =
			activeColumn === "available" ? availableListRef : selectedListRef;

		if (ref.current && container.current) {
			const el = ref.current;
			const containerEl = container.current;
			const elRect = el.getBoundingClientRect();
			const containerRect = containerEl.getBoundingClientRect();
			const padding = 40;

			if (elRect.top < containerRect.top + padding) {
				containerEl.scrollBy({
					top: elRect.top - containerRect.top - padding,
					behavior: "smooth",
				});
			} else if (elRect.bottom > containerRect.bottom - padding) {
				containerEl.scrollBy({
					top: elRect.bottom - containerRect.bottom + padding,
					behavior: "smooth",
				});
			}
		}
	}, [activeColumn, availableIndex, selectedIndex]);

	// Reset available index when search or filters change
	// biome-ignore lint/correctness/useExhaustiveDependencies: searchQuery/filters change triggers reset
	useEffect(() => {
		setAvailableIndex(0);
	}, [searchQuery, filterByYear, filterMinTracks]);

	return (
		<div className="flex h-[calc(100vh-200px)] flex-col gap-4">
			{/* Header */}
			<div className="flex items-center justify-between">
				<h2 className="font-semibold text-lg">Select 50 Albums</h2>
				<div className="flex items-center gap-4">
					<span className="text-muted-foreground text-sm">
						{selectedAlbums.length}/50 selected
					</span>
					{selectedAlbums.length === 50 && (
						<button
							type="button"
							onClick={onDone}
							className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90"
						>
							Start Ranking
						</button>
					)}
				</div>
			</div>

			{/* Keyboard hints */}
			<div className="flex items-center gap-2 text-muted-foreground text-xs">
				<KbdGroup>
					<Kbd>←</Kbd>
					<Kbd>→</Kbd>
				</KbdGroup>
				<span>Switch columns</span>
				<span>•</span>
				<KbdGroup>
					<Kbd>↑</Kbd>
					<Kbd>↓</Kbd>
				</KbdGroup>
				<span>Navigate</span>
				<span>•</span>
				<Kbd>Enter</Kbd>
				<span>Add/Remove</span>
				{selectedAlbums.length === 50 && (
					<>
						<span>•</span>
						<Kbd>Esc</Kbd>
						<span>Start Ranking</span>
					</>
				)}
			</div>

			{/* Two columns */}
			<div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
				{/* Available Albums */}
				<div
					className={cn(
						"flex flex-col rounded-lg border",
						activeColumn === "available" && "ring-2 ring-primary",
					)}
				>
					<div className="border-b p-3">
						<h3 className="mb-2 font-medium text-sm">
							Available ({filteredAvailable.length})
						</h3>
						<div className="mb-2 flex flex-col gap-2">
							<div className="flex items-center gap-2">
								<input
									type="checkbox"
									id="filter-by-year"
									checked={filterByYear}
									onChange={(e) => setFilterByYear(e.target.checked)}
									className="h-4 w-4 rounded border-gray-300"
								/>
								<label
									htmlFor="filter-by-year"
									className="cursor-pointer text-sm"
								>
									Released in {year}
								</label>
							</div>
							<div className="flex items-center gap-2">
								<input
									type="checkbox"
									id="filter-min-tracks"
									checked={filterMinTracks}
									onChange={(e) => setFilterMinTracks(e.target.checked)}
									className="h-4 w-4 rounded border-gray-300"
								/>
								<label
									htmlFor="filter-min-tracks"
									className="cursor-pointer text-sm"
								>
									No singles
								</label>
							</div>
						</div>
						<input
							type="text"
							placeholder="Search albums..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && filteredAvailable[0] && selectedAlbums.length < 50) {
									e.preventDefault();
									onAddAlbum(filteredAvailable[0]._id);
									setSearchQuery("");
								}
							}}
							className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
						/>
					</div>
					<div
						ref={availableListRef}
						className="flex-1 overflow-y-auto p-2"
						onClick={() => setActiveColumn("available")}
					>
						{filteredAvailable.length === 0 ? (
							<div className="flex h-full items-center justify-center text-muted-foreground text-sm">
								No albums found
							</div>
						) : (
							<div className="space-y-0.5">
								{filteredAvailable.map((album, idx) => (
									<PickerAlbumRow
										key={album._id}
										ref={
											activeColumn === "available" && idx === availableIndex
												? availableRowRef
												: undefined
										}
										name={album.name}
										artistName={album.artistName}
										imageUrl={album.imageUrl}
										isSelected={
											activeColumn === "available" && idx === availableIndex
										}
										onClick={() => {
											setActiveColumn("available");
											setAvailableIndex(idx);
										}}
										onDoubleClick={() => {
											if (selectedAlbums.length < 50) {
												onAddAlbum(album._id);
											}
										}}
									/>
								))}
							</div>
						)}
					</div>
				</div>

				{/* Selected Albums */}
				<div
					className={cn(
						"flex flex-col rounded-lg border",
						activeColumn === "selected" && "ring-2 ring-primary",
					)}
				>
					<div className="border-b p-3">
						<h3 className="font-medium text-sm">
							Selected ({selectedAlbums.length})
						</h3>
					</div>
					<div
						ref={selectedListRef}
						className="flex-1 overflow-y-auto p-2"
						onClick={() => setActiveColumn("selected")}
					>
						{selectedAlbums.length === 0 ? (
							<div className="flex h-full items-center justify-center text-muted-foreground text-sm">
								No albums selected
							</div>
						) : (
							<div className="space-y-0.5">
								{selectedAlbums.map((album, idx) => (
									<PickerAlbumRow
										key={album._id}
										ref={
											activeColumn === "selected" && idx === selectedIndex
												? selectedRowRef
												: undefined
										}
										name={album.album?.name ?? "Unknown"}
										artistName={album.album?.artistName ?? "Unknown"}
										imageUrl={album.album?.imageUrl}
										isSelected={
											activeColumn === "selected" && idx === selectedIndex
										}
										onClick={() => {
											setActiveColumn("selected");
											setSelectedIndex(idx);
										}}
										onDoubleClick={() => onRemoveAlbum(album._id)}
									/>
								))}
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

type PickerAlbumRowProps = {
	name: string;
	artistName: string;
	imageUrl?: string;
	isSelected: boolean;
	onClick: () => void;
	onDoubleClick: () => void;
};

const PickerAlbumRow = forwardRef<HTMLDivElement, PickerAlbumRowProps>(
	function PickerAlbumRow(
		{ name, artistName, imageUrl, isSelected, onClick, onDoubleClick },
		ref,
	) {
		return (
			<div
				ref={ref}
				onClick={onClick}
				onDoubleClick={onDoubleClick}
				className={cn(
					"flex cursor-pointer items-center gap-2 rounded-md p-1 hover:bg-muted/50",
					isSelected && "ring-2 ring-primary",
				)}
			>
				<div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded bg-muted">
					{imageUrl ? (
						<Image
							src={imageUrl}
							alt={name}
							fill
							className="object-cover"
							sizes="32px"
						/>
					) : (
						<div className="flex h-full w-full items-center justify-center">
							<Disc3 className="h-4 w-4 text-muted-foreground" />
						</div>
					)}
				</div>
				<div className="min-w-0 flex-1">
					<p className="truncate text-sm">{name}</p>
					<p className="truncate text-muted-foreground text-xs">{artistName}</p>
				</div>
			</div>
		);
	},
);
