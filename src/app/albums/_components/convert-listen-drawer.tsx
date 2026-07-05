"use client";

import { useMutation, useQuery } from "convex/react";
import { Search } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
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
import type { Id } from "../../../../convex/_generated/dataModel";
import type { HistoryListen } from "../_utils/types";

type SpotifyAlbumSearchResult = {
	albumId: Id<"spotifyAlbums">;
	spotifyAlbumId: string;
	name: string;
	artistName: string;
	imageUrl?: string;
	releaseDate?: string;
	totalTracks: number;
};

export function ConvertListenDrawer({
	listen,
	open,
	onOpenChange,
}: {
	listen: HistoryListen | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [searchInput, debouncedSearch, setSearchInput] = useDebouncedState(
		"",
		250,
	);
	const [searchAllAlbums, setSearchAllAlbums] = useState(false);
	const [isConverting, setIsConverting] = useState(false);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const convertAlbumListen = useMutation(api.spotify.convertAlbumListen);

	useEffect(() => {
		if (!open) {
			setSearchInput("");
			setSearchAllAlbums(false);
			return;
		}
		if (!listen?.album?.name) {
			return;
		}
		setSearchInput(listen.album.name);
		setSearchAllAlbums(false);
		const focusTimer = window.setTimeout(() => {
			searchInputRef.current?.focus();
		}, 0);
		return () => {
			window.clearTimeout(focusTimer);
		};
	}, [open, listen, setSearchInput]);

	const searchArg = useMemo(() => {
		const trimmed = debouncedSearch.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	}, [debouncedSearch]);

	const sameTitleResults = useQuery(
		api.spotify.searchSpotifyAlbumsByTitleKey,
		open && listen?.album?.name && !searchAllAlbums
			? {
					albumName: listen.album.name,
					excludeAlbumId: listen.albumId as Id<"spotifyAlbums">,
					search: searchArg,
					limit: 50,
				}
			: "skip",
	);

	const allAlbumResults = useQuery(
		api.spotify.searchSpotifyAlbumsForListenConversion,
		open && listen && searchAllAlbums
			? {
					excludeAlbumId: listen.albumId as Id<"spotifyAlbums">,
					search: searchArg,
					limit: 50,
				}
			: "skip",
	);

	const results = searchAllAlbums ? allAlbumResults : sameTitleResults;
	const isLoading = results === undefined;

	async function handleSelectAlbum(album: SpotifyAlbumSearchResult) {
		if (!listen || isConverting) {
			return;
		}

		setIsConverting(true);
		try {
			const result = await convertAlbumListen({
				listenId: listen._id as Id<"userAlbumListens">,
				targetAlbumId: album.albumId,
			});

			if (result.converted) {
				toast.success(
					`Moved listen to "${result.targetAlbumName ?? album.name}"`,
				);
				onOpenChange(false);
				return;
			}

			if (result.reason === "duplicate_listen") {
				toast.error("That album already has a listen at this date");
				return;
			}

			toast.error("Could not convert listen");
		} catch (error) {
			console.error("Failed to convert listen:", error);
			toast.error("Failed to convert listen");
		} finally {
			setIsConverting(false);
		}
	}

	return (
		<Drawer open={open} onOpenChange={onOpenChange} direction="right">
			<DrawerContent className="flex h-full w-full flex-col sm:max-w-md">
				<DrawerHeader className="shrink-0 gap-2 border-b pb-4 text-left">
					<DrawerTitle>Convert listen</DrawerTitle>
					<DrawerDescription>
						{listen?.album
							? `Move this listen from ${listen.album.name} to another edition.`
							: "Choose the album this listen should count toward."}
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
					{isLoading ? (
						<p className="text-muted-foreground text-sm">Loading albums...</p>
					) : results.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							{searchAllAlbums
								? "No albums match this search."
								: "No other editions with the same title found."}
						</p>
					) : (
						<ul className="divide-y rounded-lg border">
							{results.map((album) => (
								<li key={album.albumId}>
									<AlbumPickerRow
										album={album}
										disabled={isConverting}
										onSelect={() => void handleSelectAlbum(album)}
									/>
								</li>
							))}
						</ul>
					)}

					{!searchAllAlbums ? (
						<button
							type="button"
							className="mt-4 font-medium text-sm underline underline-offset-4 hover:text-primary"
							onClick={() => setSearchAllAlbums(true)}
						>
							Search all albums
						</button>
					) : (
						<button
							type="button"
							className="mt-4 font-medium text-sm underline underline-offset-4 hover:text-primary"
							onClick={() => setSearchAllAlbums(false)}
						>
							Back to same-title matches
						</button>
					)}
				</div>
			</DrawerContent>
		</Drawer>
	);
}

function AlbumPickerRow({
	album,
	disabled,
	onSelect,
}: {
	album: SpotifyAlbumSearchResult;
	disabled: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
			onClick={onSelect}
		>
			{album.imageUrl ? (
				<Image
					src={album.imageUrl}
					alt=""
					width={40}
					height={40}
					className="size-10 shrink-0 rounded object-cover"
				/>
			) : (
				<div className="size-10 shrink-0 rounded bg-muted" />
			)}
			<div className="min-w-0 flex-1">
				<p className="truncate font-medium text-sm leading-snug">{album.name}</p>
				<p className="truncate text-muted-foreground text-xs">
					{album.artistName}
					{album.releaseDate ? ` · ${album.releaseDate.slice(0, 4)}` : ""}
					{` · ${album.totalTracks} tracks`}
				</p>
			</div>
		</button>
	);
}
