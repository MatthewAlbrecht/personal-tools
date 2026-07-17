"use client";

import { useQuery } from "convex/react";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import type { AlbumLibraryRowData } from "../_utils/types";

export function AlbumRymAssociateDrawer({
	album,
	open,
	onOpenChange,
	onAssociate,
}: {
	album: AlbumLibraryRowData | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onAssociate: (selection: {
		scrapeId: Id<"rateYourMusicScrapes">;
		rymUrl: string;
	}) => void;
}) {
	const [searchInput, debouncedSearch, setSearchInput] = useDebouncedState(
		"",
		250,
	);
	const [includeMapped, setIncludeMapped] = useState(false);
	const searchInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!open) {
			setSearchInput("");
			setIncludeMapped(false);
			return;
		}
		if (!album) {
			return;
		}
		setSearchInput(album.artistName);
		setIncludeMapped(false);
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

	const scrapes = useQuery(
		api.forLaterAlbums.searchUnmappedRymScrapes,
		open ? { search: searchArg, includeMapped, limit: 50 } : "skip",
	);

	return (
		<Drawer open={open} onOpenChange={onOpenChange} direction="right">
			<DrawerContent className="flex h-full w-full flex-col sm:max-w-md">
				<DrawerHeader className="shrink-0 gap-2 border-b pb-4 text-left">
					<DrawerTitle>Link RYM release</DrawerTitle>
					<DrawerDescription>
						{album
							? `Choose a scraped Rate Your Music page for ${album.name} by ${album.artistName}.`
							: "Choose a scraped Rate Your Music page."}
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
					{scrapes === undefined ? (
						<p className="text-muted-foreground text-sm">Loading scrapes...</p>
					) : scrapes.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							{includeMapped
								? "No RYM scrapes match this search."
								: "No unlinked RYM scrapes match this search. "}
							{includeMapped ? null : (
								<button
									type="button"
									className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
									onClick={() => setIncludeMapped(true)}
								>
									Search already linked albums too.
								</button>
							)}
						</p>
					) : (
						<ul className="divide-y rounded-lg border">
							{scrapes.map((scrape) => (
								<li key={scrape.scrapeId}>
									<ScrapePickerRow
										scrape={scrape}
										onSelect={() =>
											onAssociate({
												scrapeId: scrape.scrapeId,
												rymUrl: scrape.rymUrl,
											})
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

function ScrapePickerRow({
	scrape,
	onSelect,
}: {
	scrape: {
		scrapeId: Id<"rateYourMusicScrapes">;
		albumTitle: string;
		artists: Array<{ name: string }>;
	};
	onSelect: () => void;
}) {
	const artistLine = scrape.artists.map((artist) => artist.name).join(", ");

	return (
		<button
			type="button"
			className="w-full px-3 py-2 text-left transition-colors hover:bg-muted/50"
			onClick={onSelect}
		>
			<p className="font-medium text-sm leading-snug">{scrape.albumTitle}</p>
			<p className="text-muted-foreground text-xs">{artistLine}</p>
		</button>
	);
}
