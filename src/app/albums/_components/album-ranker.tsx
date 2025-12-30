"use client";

import { X } from "lucide-react";
import {
	forwardRef,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "~/components/ui/drawer";
import {
	TIER_ORDER,
	type TierName,
	getRatingsForTier,
	getTierInfo,
} from "~/lib/album-tiers";

type RankedAlbum = {
	_id: string;
	albumId: string;
	rating?: number;
	position?: number;
	album: {
		name: string;
		artistName: string;
		imageUrl?: string;
		releaseDate?: string;
	} | null;
};

type AlbumToRate = {
	userAlbumId: string;
	albumId: string;
	name: string;
	artistName: string;
	imageUrl?: string;
	releaseDate?: string;
};

type AlbumRankerProps = {
	albumToRate: AlbumToRate | null;
	existingRankedAlbums: RankedAlbum[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSave: (rating: number, position: number) => void;
};

// All possible slots: 15 ratings (Holy Moly High=15 down to Actively Bad Low=1)
const ALL_RATINGS = [
	15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
] as const;

export function AlbumRanker({
	albumToRate,
	existingRankedAlbums,
	open,
	onOpenChange,
	onSave,
}: AlbumRankerProps) {
	// Current rating for the new album (starts at top = 15)
	const [currentRating, setCurrentRating] = useState(15);
	// Position within the current rating's list (0 = top)
	const [positionInRating, setPositionInRating] = useState(0);

	const containerRef = useRef<HTMLDivElement>(null);
	const newAlbumRowRef = useRef<HTMLDivElement>(null);

	// Memoize albumToRate id to detect when a NEW album is being rated
	const albumToRateId = albumToRate?.userAlbumId;

	// Reset state only when a different album is selected
	useEffect(() => {
		if (albumToRateId) {
			setCurrentRating(15);
			setPositionInRating(0);
		}
	}, [albumToRateId]);

	// Scroll the new album row into view when position changes (with padding)
	// biome-ignore lint/correctness/useExhaustiveDependencies: dependencies trigger scroll on position change
	useEffect(() => {
		const el = newAlbumRowRef.current;
		const container = containerRef.current;
		if (!el || !container) return;

		const padding = 80; // Extra scroll padding in pixels
		const elRect = el.getBoundingClientRect();
		const containerRect = container.getBoundingClientRect();

		if (elRect.top < containerRect.top + padding) {
			// Element is above visible area - scroll up
			container.scrollBy({
				top: elRect.top - containerRect.top - padding,
				behavior: "smooth",
			});
		} else if (elRect.bottom > containerRect.bottom - padding) {
			// Element is below visible area - scroll down
			container.scrollBy({
				top: elRect.bottom - containerRect.bottom + padding,
				behavior: "smooth",
			});
		}
	}, [currentRating, positionInRating]);

	// Group existing albums by rating
	const albumsByRating = useCallback(() => {
		const groups = new Map<number, RankedAlbum[]>();
		for (const rating of ALL_RATINGS) {
			groups.set(rating, []);
		}
		for (const album of existingRankedAlbums) {
			if (album.rating !== undefined) {
				const list = groups.get(album.rating) ?? [];
				list.push(album);
				groups.set(album.rating, list);
			}
		}
		// Sort each group by position
		for (const [rating, albums] of groups) {
			albums.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
			groups.set(rating, albums);
		}
		return groups;
	}, [existingRankedAlbums]);

	const groups = albumsByRating();

	// Get albums at current rating
	const albumsAtCurrentRating = groups.get(currentRating) ?? [];
	const maxPositionInRating = albumsAtCurrentRating.length; // Can be 0 to length (insert at end)

	// Move within current rating or to adjacent rating
	const moveUp = useCallback(() => {
		if (positionInRating > 0) {
			// Move up within current rating
			setPositionInRating(positionInRating - 1);
		} else {
			// Move to previous rating (higher number)
			const currentIdx = ALL_RATINGS.indexOf(
				currentRating as (typeof ALL_RATINGS)[number],
			);
			if (currentIdx > 0) {
				const prevRating = ALL_RATINGS[currentIdx - 1];
				if (prevRating !== undefined) {
					setCurrentRating(prevRating);
					// Position at bottom of that rating
					const prevAlbums = groups.get(prevRating) ?? [];
					setPositionInRating(prevAlbums.length);
				}
			}
		}
	}, [positionInRating, currentRating, groups]);

	const moveDown = useCallback(() => {
		if (positionInRating < maxPositionInRating) {
			// Move down within current rating
			setPositionInRating(positionInRating + 1);
		} else {
			// Move to next rating (lower number)
			const currentIdx = ALL_RATINGS.indexOf(
				currentRating as (typeof ALL_RATINGS)[number],
			);
			if (currentIdx < ALL_RATINGS.length - 1) {
				const nextRating = ALL_RATINGS[currentIdx + 1];
				if (nextRating !== undefined) {
					setCurrentRating(nextRating);
					setPositionInRating(0);
				}
			}
		}
	}, [positionInRating, maxPositionInRating, currentRating]);

	// Jump to next/prev sub-tier (High/Med/Low boundary)
	const jumpToTier = useCallback(
		(direction: "up" | "down") => {
			const currentTierInfo = getTierInfo(currentRating);
			if (!currentTierInfo) return;

			const currentTierIdx = TIER_ORDER.indexOf(currentTierInfo.tier);

			if (direction === "up") {
				if (currentTierInfo.subTier === "Low") {
					// Move to same tier's Med
					const medRating = getRatingsForTier(currentTierInfo.tier).med;
					setCurrentRating(medRating);
					setPositionInRating(0);
				} else if (currentTierInfo.subTier === "Med") {
					// Move to same tier's High
					const highRating = getRatingsForTier(currentTierInfo.tier).high;
					setCurrentRating(highRating);
					setPositionInRating(0);
				} else if (currentTierIdx > 0) {
					// At a tier's High - move to prev tier's Low
					const prevTier = TIER_ORDER[currentTierIdx - 1];
					if (prevTier) {
						const lowRating = getRatingsForTier(prevTier).low;
						setCurrentRating(lowRating);
						setPositionInRating(0);
					}
				}
			} else {
				if (currentTierInfo.subTier === "High") {
					// Move to same tier's Med
					const medRating = getRatingsForTier(currentTierInfo.tier).med;
					setCurrentRating(medRating);
					setPositionInRating(0);
				} else if (currentTierInfo.subTier === "Med") {
					// Move to same tier's Low
					const lowRating = getRatingsForTier(currentTierInfo.tier).low;
					setCurrentRating(lowRating);
					setPositionInRating(0);
				} else if (currentTierIdx < TIER_ORDER.length - 1) {
					// At a tier's Low - move to next tier's High
					const nextTier = TIER_ORDER[currentTierIdx + 1];
					if (nextTier) {
						const highRating = getRatingsForTier(nextTier).high;
						setCurrentRating(highRating);
						setPositionInRating(0);
					}
				}
			}
		},
		[currentRating],
	);

	// Calculate final position value for saving
	const calculatePosition = useCallback((): number => {
		const albumsAtRating = groups.get(currentRating) ?? [];

		if (albumsAtRating.length === 0) {
			return 0;
		}

		if (positionInRating === 0) {
			// Insert at top
			const firstAlbum = albumsAtRating[0];
			return (firstAlbum?.position ?? 0) - 1;
		}
		if (positionInRating >= albumsAtRating.length) {
			// Insert at bottom
			const lastAlbum = albumsAtRating[albumsAtRating.length - 1];
			return (lastAlbum?.position ?? 0) + 1;
		}
		// Insert between two albums
		const before = albumsAtRating[positionInRating - 1];
		const after = albumsAtRating[positionInRating];
		return ((before?.position ?? 0) + (after?.position ?? 0)) / 2;
	}, [groups, currentRating, positionInRating]);

	const handleSave = useCallback(() => {
		if (!albumToRate) return;
		const position = calculatePosition();
		onSave(currentRating, position);
	}, [albumToRate, currentRating, onSave, calculatePosition]);

	// Keyboard handler
	useEffect(() => {
		if (!open) return;

		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") {
				onOpenChange(false);
				return;
			}

			if (e.key === "Enter") {
				if (e.repeat) return;
				e.preventDefault();
				e.stopPropagation();
				handleSave();
				return;
			}

			if (e.key === "ArrowUp") {
				e.preventDefault();
				if (e.shiftKey) {
					jumpToTier("up");
				} else {
					moveUp();
				}
			} else if (e.key === "ArrowDown") {
				e.preventDefault();
				if (e.shiftKey) {
					jumpToTier("down");
				} else {
					moveDown();
				}
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [open, onOpenChange, handleSave, moveUp, moveDown, jumpToTier]);

	// Focus container when drawer opens for keyboard events
	useEffect(() => {
		if (open) {
			containerRef.current?.focus();
		}
	}, [open]);

	if (!albumToRate) return null;

	const currentTierInfo = getTierInfo(currentRating);

	return (
		<Drawer open={open} onOpenChange={onOpenChange} direction="right">
			<DrawerContent className="h-full max-w-2xl">
				<DrawerHeader>
					<DrawerTitle>Rate Album</DrawerTitle>
					<DrawerDescription>
						Use arrow keys to position, Shift+arrows for tier jumps
					</DrawerDescription>
				</DrawerHeader>

				<div
					ref={containerRef}
					tabIndex={-1}
					className="overflow-y-auto px-4 pb-4 outline-none"
				>
					{/* Instructions */}
					<div className="mb-4 flex items-center justify-between text-muted-foreground text-xs">
						<span>↑↓ Move • Shift+↑↓ Jump tier • Enter Save • Esc Cancel</span>
					</div>

					{/* All tiers - always show the template */}
					<div className="space-y-4">
						{TIER_ORDER.map((tier) => {
							const {
								high: highRating,
								med: medRating,
								low: lowRating,
							} = getRatingsForTier(tier);
							const highAlbums = groups.get(highRating) ?? [];
							const medAlbums = groups.get(medRating) ?? [];
							const lowAlbums = groups.get(lowRating) ?? [];

							return (
								<div key={tier} className="rounded-lg border p-3">
									<h3 className="mb-3 font-semibold text-sm">{tier}</h3>

									{/* High sub-tier */}
									<div className="mb-3">
										<p className="mb-1.5 text-muted-foreground text-xs">High</p>
										<div className="min-h-[40px] space-y-1">
											<TierSlot
												albums={highAlbums}
												rating={highRating}
												currentRating={currentRating}
												positionInRating={positionInRating}
												newAlbum={albumToRate}
												newAlbumRef={newAlbumRowRef}
											/>
										</div>
									</div>

									{/* Med sub-tier */}
									<div className="mb-3">
										<p className="mb-1.5 text-muted-foreground text-xs">Med</p>
										<div className="min-h-[40px] space-y-1">
											<TierSlot
												albums={medAlbums}
												rating={medRating}
												currentRating={currentRating}
												positionInRating={positionInRating}
												newAlbum={albumToRate}
												newAlbumRef={newAlbumRowRef}
											/>
										</div>
									</div>

									{/* Low sub-tier */}
									<div>
										<p className="mb-1.5 text-muted-foreground text-xs">Low</p>
										<div className="min-h-[40px] space-y-1">
											<TierSlot
												albums={lowAlbums}
												rating={lowRating}
												currentRating={currentRating}
												positionInRating={positionInRating}
												newAlbum={albumToRate}
												newAlbumRef={newAlbumRowRef}
											/>
										</div>
									</div>
								</div>
							);
						})}
					</div>
				</div>

				<DrawerFooter className="flex-row justify-end gap-3">
					<button
						type="button"
						onClick={() => onOpenChange(false)}
						className="rounded-md px-4 py-2 text-muted-foreground text-sm hover:bg-muted hover:text-foreground"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleSave}
						className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90"
					>
						Save Rating
					</button>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}

// Renders a tier slot with existing albums and the new album insertion point
function TierSlot({
	albums,
	rating,
	currentRating,
	positionInRating,
	newAlbum,
	newAlbumRef,
}: {
	albums: RankedAlbum[];
	rating: number;
	currentRating: number;
	positionInRating: number;
	newAlbum: AlbumToRate;
	newAlbumRef: React.RefObject<HTMLDivElement | null>;
}) {
	const isCurrentTier = rating === currentRating;

	// If this is the current tier, we need to show the new album at the right position
	if (isCurrentTier) {
		const elements: React.ReactNode[] = [];

		for (let i = 0; i <= albums.length; i++) {
			// Show new album insertion point
			if (i === positionInRating) {
				elements.push(
					<NewAlbumRow key="new" album={newAlbum} ref={newAlbumRef} />,
				);
			}

			// Show existing album
			if (i < albums.length) {
				const album = albums[i];
				if (album?.album) {
					elements.push(<ExistingAlbumRow key={album._id} album={album} />);
				}
			}
		}

		// If inserting at end and we haven't shown it yet
		if (
			positionInRating >= albums.length &&
			elements.filter((e) => e && (e as React.ReactElement).key === "new")
				.length === 0
		) {
			elements.push(
				<NewAlbumRow key="new" album={newAlbum} ref={newAlbumRef} />,
			);
		}

		if (elements.length === 0) {
			return <NewAlbumRow album={newAlbum} ref={newAlbumRef} />;
		}

		return <>{elements}</>;
	}

	// Not the current tier - just show existing albums or empty state
	if (albums.length === 0) {
		return (
			<div className="flex h-10 items-center justify-center rounded-md border border-dashed text-muted-foreground text-xs">
				Empty
			</div>
		);
	}

	return (
		<>
			{albums.map(
				(album) =>
					album.album && <ExistingAlbumRow key={album._id} album={album} />,
			)}
		</>
	);
}

const NewAlbumRow = forwardRef<HTMLDivElement, { album: AlbumToRate }>(
	function NewAlbumRow({ album }, ref) {
		return (
			<div
				ref={ref}
				className="truncate rounded-md bg-primary/10 px-2 py-1.5 text-sm ring-2 ring-primary"
			>
				<span className="font-medium">{album.artistName}</span>
				<span className="text-muted-foreground"> – </span>
				<span>{album.name}</span>
			</div>
		);
	},
);

function ExistingAlbumRow({ album }: { album: RankedAlbum }) {
	if (!album.album) return null;

	return (
		<div className="truncate rounded-md bg-muted/30 px-2 py-1.5 text-sm">
			<span className="font-medium">{album.album.artistName}</span>
			<span className="text-muted-foreground"> – </span>
			<span>{album.album.name}</span>
		</div>
	);
}
