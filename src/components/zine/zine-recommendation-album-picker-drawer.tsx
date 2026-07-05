"use client";

import { useConvex, useQuery } from "convex/react";
import { ClipboardPaste, Disc3, Search } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "~/components/ui/drawer";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useDebouncedState } from "~/lib/hooks/use-debounced-state";
import { parseSpotifyAlbumId } from "~/lib/parse-spotify-album-id";
import { extractReleaseYear } from "~/lib/zine/spotify-discography-import";
import { api } from "../../../convex/_generated/api";

export type ZineSpotifyAlbumPickerSelection = {
	spotifyAlbumId: string;
	albumTitle: string;
	artistName: string;
	year?: string;
	imageUrl?: string;
};

export function ZineRecommendationAlbumPickerDrawer({
	open,
	onOpenChange,
	initialSearch,
	onSelect,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	initialSearch?: string;
	onSelect: (selection: ZineSpotifyAlbumPickerSelection) => void;
}) {
	const convex = useConvex();
	const [searchInput, debouncedSearch, setSearchInput] = useDebouncedState(
		"",
		250,
	);
	const [pasteInput, setPasteInput] = useState("");
	const [isApplyingPaste, setIsApplyingPaste] = useState(false);
	const searchInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!open) {
			setSearchInput("");
			setPasteInput("");
			return;
		}

		setSearchInput(initialSearch?.trim() ?? "");
		const focusTimer = window.setTimeout(() => {
			searchInputRef.current?.focus();
		}, 0);
		return () => {
			window.clearTimeout(focusTimer);
		};
	}, [open, initialSearch, setSearchInput]);

	const searchArg = useMemo(() => {
		const trimmed = debouncedSearch.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	}, [debouncedSearch]);

	const spotifyAlbums = useQuery(
		api.geniusAlbums.searchSpotifyAlbumsForMapping,
		open ? { search: searchArg, limit: 50 } : "skip",
	);

	function handleSelectAlbum(album: {
		spotifyAlbumId: string;
		name: string;
		artistName: string;
		imageUrl?: string;
		releaseDate?: string;
	}) {
		onSelect({
			spotifyAlbumId: album.spotifyAlbumId,
			albumTitle: album.name,
			artistName: album.artistName,
			year: album.releaseDate
				? extractReleaseYear(album.releaseDate)
				: undefined,
			imageUrl: album.imageUrl,
		});
		onOpenChange(false);
	}

	async function handleApplyPaste() {
		const spotifyAlbumId = parseSpotifyAlbumId(pasteInput);
		if (!spotifyAlbumId) {
			toast.error("Paste a Spotify album URL or ID.");
			return;
		}

		setIsApplyingPaste(true);
		try {
			const album = await convex.query(
				api.geniusAlbums.lookupSpotifyAlbumForZinePicker,
				{ spotifyAlbumId },
			);
			if (!album) {
				toast.error("That Spotify album is not in your library yet.");
				return;
			}
			handleSelectAlbum(album);
			setPasteInput("");
		} catch (error) {
			console.error("Failed to look up pasted Spotify album:", error);
			toast.error("Could not look up that Spotify album.");
		} finally {
			setIsApplyingPaste(false);
		}
	}

	return (
		<Drawer open={open} onOpenChange={onOpenChange} direction="right">
			<DrawerContent className="flex h-full w-full flex-col sm:max-w-md">
				<DrawerHeader className="shrink-0 gap-2 border-b pb-4 text-left">
					<DrawerTitle>Choose recommended album</DrawerTitle>
					<DrawerDescription>
						Search your Spotify album library by artist or album name, or paste
						a Spotify album link.
					</DrawerDescription>
					<div className="relative pt-1">
						<Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
						<Input
							ref={searchInputRef}
							value={searchInput}
							onChange={(event) => setSearchInput(event.currentTarget.value)}
							placeholder="Search by album or artist"
							className="pl-9"
						/>
					</div>
				</DrawerHeader>
				<div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
					{spotifyAlbums === undefined ? (
						<p className="text-muted-foreground text-sm">Loading albums...</p>
					) : spotifyAlbums.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No local Spotify albums match this search.
						</p>
					) : (
						<ul className="divide-y rounded-lg border">
							{spotifyAlbums.map((spotifyAlbum) => (
								<li key={spotifyAlbum.albumId}>
									<SpotifyAlbumPickerRow
										spotifyAlbum={spotifyAlbum}
										onSelect={() => handleSelectAlbum(spotifyAlbum)}
									/>
								</li>
							))}
						</ul>
					)}
				</div>
				<DrawerFooter className="shrink-0 border-t pt-4">
					<div className="space-y-2 text-left">
						<Label htmlFor="zine-recommendation-album-paste">
							Paste Spotify album URL or ID
						</Label>
						<div className="flex gap-2">
							<Input
								id="zine-recommendation-album-paste"
								value={pasteInput}
								disabled={isApplyingPaste}
								onChange={(event) => setPasteInput(event.currentTarget.value)}
								placeholder="https://open.spotify.com/album/..."
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										void handleApplyPaste();
									}
								}}
							/>
							<Button
								type="button"
								variant="secondary"
								onClick={() => void handleApplyPaste()}
								disabled={!pasteInput.trim() || isApplyingPaste}
							>
								<ClipboardPaste className="mr-2 h-4 w-4" />
								Apply
							</Button>
						</div>
					</div>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}

function SpotifyAlbumPickerRow({
	spotifyAlbum,
	onSelect,
}: {
	spotifyAlbum: {
		name: string;
		artistName: string;
		imageUrl?: string;
		releaseDate?: string;
	};
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/50"
			onClick={onSelect}
		>
			<div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-muted">
				{spotifyAlbum.imageUrl ? (
					<Image
						src={spotifyAlbum.imageUrl}
						alt={spotifyAlbum.name}
						fill
						className="object-cover"
						sizes="40px"
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center">
						<Disc3 className="h-4 w-4 text-muted-foreground" />
					</div>
				)}
			</div>
			<div className="min-h-0 flex-1">
				<p className="font-medium text-sm leading-snug">{spotifyAlbum.name}</p>
				<p className="text-muted-foreground text-xs">{spotifyAlbum.artistName}</p>
				{spotifyAlbum.releaseDate ? (
					<p className="text-muted-foreground text-xs">
						{spotifyAlbum.releaseDate}
					</p>
				) : null}
			</div>
		</button>
	);
}
