"use client";

import { useMutation, useQuery } from "convex/react";
import { Plus, Search } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useDebouncedState } from "~/lib/hooks/use-debounced-state";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export function ArtistSearch({
	yearId,
	getAccessToken,
}: {
	yearId: Id<"rooYears">;
	getAccessToken: () => Promise<string | null>;
}) {
	const [searchInput, debouncedSearch, setSearchInput] = useDebouncedState(
		"",
		300,
	);
	const [addingArtistId, setAddingArtistId] = useState<string | null>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);

	const searchResults = useQuery(
		api.rooleases.searchArtists,
		debouncedSearch.length >= 2 ? { searchTerm: debouncedSearch } : "skip",
	);

	const addArtist = useMutation(api.rooleases.addArtistToYear);

	async function handleAddArtist(artist: {
		_id: Id<"spotifyArtists">;
		spotifyArtistId: string;
		name: string;
	}) {
		setAddingArtistId(artist.spotifyArtistId);
		try {
			const result = await addArtist({
				yearId,
				artistId: artist._id,
				spotifyArtistId: artist.spotifyArtistId,
			});

			if (result.added) {
				toast.success(`Added ${artist.name}`);
				setSearchInput("");
			} else {
				toast.info(`${artist.name} is already in this year`);
			}
		} catch (error) {
			console.error("Failed to add artist:", error);
			toast.error("Failed to add artist");
		} finally {
			setAddingArtistId(null);
			searchInputRef.current?.focus();
		}
	}

	const results = searchResults ?? [];
	const firstResult = results[0];
	const canQuickAdd = debouncedSearch.length >= 2 && !addingArtistId;

	return (
		<div className="relative">
			<div className="relative">
				<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					ref={searchInputRef}
					placeholder="Search artists to add..."
					value={searchInput}
					onChange={(e) => setSearchInput(e.target.value)}
					onKeyDownCapture={(event) => {
						if (event.key !== "Enter") return;
						if (!canQuickAdd) return;
						if (!firstResult) return;
						event.preventDefault();
						event.stopPropagation();
						void handleAddArtist(firstResult);
					}}
					className="pl-9"
				/>
			</div>

			{/* Search Results Dropdown */}
			{debouncedSearch.length >= 2 && results.length > 0 && (
				<div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-lg">
					{results.map((artist: { _id: Id<"spotifyArtists">; spotifyArtistId: string; name: string; imageUrl?: string }) => (
						<button
							type="button"
							key={artist._id}
							className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-accent"
							onClick={() => handleAddArtist(artist)}
							disabled={addingArtistId === artist.spotifyArtistId}
						>
							<div className="flex items-center gap-3">
								{artist.imageUrl ? (
									<img
										src={artist.imageUrl}
										alt={artist.name}
										className="h-8 w-8 rounded-full object-cover"
									/>
								) : (
									<div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
										<span className="font-medium text-muted-foreground text-xs">
											{artist.name.charAt(0)}
										</span>
									</div>
								)}
								<span className="text-sm">{artist.name}</span>
							</div>
							<Plus className="h-4 w-4 text-muted-foreground" />
						</button>
					))}
				</div>
			)}

			{debouncedSearch.length >= 2 && results.length === 0 && (
				<div className="absolute z-10 mt-1 w-full rounded-md border bg-popover p-3 text-center shadow-lg">
					<p className="text-muted-foreground text-sm">
						No artists found. Import from a playlist to add more artists.
					</p>
				</div>
			)}
		</div>
	);
}
