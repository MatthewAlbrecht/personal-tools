"use client";

import { useQuery } from "convex/react";
import { Disc3, Search } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef } from "react";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "~/components/ui/drawer";
import { Input } from "~/components/ui/input";
import { useDebouncedState } from "~/lib/hooks/use-debounced-state";
import { api } from "../../../../convex/_generated/api";

type AlbumForMapping = {
	albumTitle: string;
	artistName: string;
};

export function SpotifyAlbumMapDrawer({
	album,
	open,
	onOpenChange,
	onSelect,
	isMapping,
}: {
	album: AlbumForMapping | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSelect: (spotifyAlbumId: string) => Promise<void>;
	isMapping: boolean;
}) {
	const [searchInput, debouncedSearch, setSearchInput] = useDebouncedState(
		"",
		250,
	);
	const searchInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!open) {
			setSearchInput("");
			return;
		}
		if (!album) {
			return;
		}
		setSearchInput(album.artistName);
		const focusTimer = window.setTimeout(() => {
			searchInputRef.current?.focus();
		}, 0);
		return () => {
			window.clearTimeout(focusTimer);
		};
	}, [open, album, setSearchInput]);

	const searchArg = useMemo(() => {
		const trimmed = debouncedSearch.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	}, [debouncedSearch]);

	const spotifyAlbums = useQuery(
		api.geniusAlbums.searchSpotifyAlbumsForMapping,
		open ? { search: searchArg, limit: 50 } : "skip",
	);

	return (
		<Drawer open={open} onOpenChange={onOpenChange} direction="right">
			<DrawerContent className="flex h-full w-full flex-col sm:max-w-md">
				<DrawerHeader className="shrink-0 gap-2 border-b pb-4 text-left">
					<DrawerTitle>Map Spotify album</DrawerTitle>
					<DrawerDescription>
						{album
							? `Choose a local Spotify album for ${album.albumTitle} by ${album.artistName}.`
							: "Choose a local Spotify album."}
					</DrawerDescription>
					<div className="relative pt-1">
						<Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
						<Input
							ref={searchInputRef}
							value={searchInput}
							onChange={(event) => setSearchInput(event.target.value)}
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
										disabled={isMapping}
										onSelect={() =>
											void onSelect(spotifyAlbum.spotifyAlbumId)
										}
									/>
								</li>
							))}
						</ul>
					)}
				</div>
			</DrawerContent>
		</Drawer>
	);
}

function SpotifyAlbumPickerRow({
	spotifyAlbum,
	disabled,
	onSelect,
}: {
	spotifyAlbum: {
		name: string;
		artistName: string;
		imageUrl?: string;
		releaseDate?: string;
	};
	disabled: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
			onClick={onSelect}
			disabled={disabled}
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
			<div className="min-w-0 flex-1">
				<p className="font-medium text-sm leading-snug">{spotifyAlbum.name}</p>
				<p className="text-muted-foreground text-xs">{spotifyAlbum.artistName}</p>
				{spotifyAlbum.releaseDate && (
					<p className="text-muted-foreground text-xs">
						{spotifyAlbum.releaseDate}
					</p>
				)}
			</div>
		</button>
	);
}
