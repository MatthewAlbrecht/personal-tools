"use client";

import {
	Check,
	ChevronDown,
	ChevronUp,
	ListMusic,
	Loader2,
	X,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { formatPlaylistName } from "../_utils/formatters";
import type {
	LocalPlaylist,
	PlaylistSuggestion,
	SpotifyTrack,
} from "../_utils/types";

type PlaylistSuggestionsProps = {
	track: SpotifyTrack;
	userInput: string;
	suggestions: PlaylistSuggestion[];
	playlists: LocalPlaylist[];
	isSaving: boolean;
	onConfirm: (selectedPlaylistIds: string[]) => void;
	onCancel: () => void;
};

export function PlaylistSuggestions({
	track,
	userInput,
	suggestions,
	playlists,
	isSaving,
	onConfirm,
	onCancel,
}: PlaylistSuggestionsProps) {
	const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
		// Pre-select high confidence suggestions
		return new Set(
			suggestions
				.filter((s) => s.confidence === "high")
				.map((s) => s.playlistId),
		);
	});
	const [showOtherPlaylists, setShowOtherPlaylists] = useState(true);

	// Get playlists that weren't suggested
	const suggestedIds = new Set(suggestions.map((s) => s.playlistId));
	const otherPlaylists = playlists.filter(
		(p) => p.isActive && !suggestedIds.has(p.spotifyPlaylistId),
	);

	function togglePlaylist(playlistId: string) {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(playlistId)) {
				next.delete(playlistId);
			} else {
				next.add(playlistId);
			}
			return next;
		});
	}

	function handleConfirm() {
		onConfirm(Array.from(selectedIds));
	}

	const confidenceColors = {
		high: "bg-green-500/10 text-green-600 border-green-500/20",
		medium: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
		low: "bg-gray-500/10 text-gray-600 border-gray-500/20",
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<ListMusic className="h-5 w-5" />
					AI Suggestions for &quot;{track.name}&quot;
				</CardTitle>
				<p className="text-muted-foreground text-sm">
					Your description: &quot;{userInput}&quot;
				</p>
			</CardHeader>
			<CardContent className="space-y-4">
				{/* AI Suggestions */}
				{suggestions.length === 0 ? (
					<div className="py-4 text-center">
						<p className="text-muted-foreground">
							No strong matches found for this description.
						</p>
					</div>
				) : (
					<div className="space-y-2">
						{suggestions.map((suggestion) => {
							const playlist = playlists.find(
								(p) => p.spotifyPlaylistId === suggestion.playlistId,
							);
							const isSelected = selectedIds.has(suggestion.playlistId);

							return (
								<div
									key={suggestion.playlistId}
									className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
										isSelected ? "border-primary bg-primary/5" : "border-border"
									}`}
								>
									<Checkbox
										id={suggestion.playlistId}
										checked={isSelected}
										onCheckedChange={() =>
											togglePlaylist(suggestion.playlistId)
										}
										disabled={isSaving}
									/>
									<div className="flex-1 space-y-1">
										<div className="flex items-center gap-2">
											<label
												htmlFor={suggestion.playlistId}
												className="cursor-pointer font-medium"
											>
												{formatPlaylistName(suggestion.playlistName)}
											</label>
											<Badge
												variant="outline"
												className={confidenceColors[suggestion.confidence]}
											>
												{suggestion.confidence}
											</Badge>
										</div>
										<p className="text-muted-foreground text-sm">
											{suggestion.reason}
										</p>
									</div>
								</div>
							);
						})}
					</div>
				)}

				{/* Other Playlists (not suggested) */}
				{otherPlaylists.length > 0 && (
					<div className="border-t pt-3">
						<button
							type="button"
							onClick={() => setShowOtherPlaylists(!showOtherPlaylists)}
							className="flex w-full items-center justify-between text-muted-foreground text-sm hover:text-foreground"
						>
							<span>Other playlists ({otherPlaylists.length})</span>
							{showOtherPlaylists ? (
								<ChevronUp className="h-4 w-4" />
							) : (
								<ChevronDown className="h-4 w-4" />
							)}
						</button>

						{showOtherPlaylists && (
							<div className="mt-2 flex flex-wrap gap-2">
								{otherPlaylists.map((playlist) => {
									const isSelected = selectedIds.has(
										playlist.spotifyPlaylistId,
									);
									return (
										<button
											key={playlist.spotifyPlaylistId}
											type="button"
											onClick={() => togglePlaylist(playlist.spotifyPlaylistId)}
											disabled={isSaving}
											className={`rounded-full border px-3 py-1 text-sm transition-colors ${
												isSelected
													? "border-primary bg-primary/10 text-primary"
													: "border-border hover:border-muted-foreground"
											}`}
										>
											{formatPlaylistName(playlist.name)}
										</button>
									);
								})}
							</div>
						)}
					</div>
				)}

				<div className="flex gap-2 pt-2">
					<Button onClick={handleConfirm} disabled={isSaving}>
						{isSaving ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Adding to playlists...
							</>
						) : selectedIds.size > 0 ? (
							<>
								<Check className="mr-2 h-4 w-4" />
								Add to {selectedIds.size} playlist
								{selectedIds.size !== 1 ? "s" : ""}
							</>
						) : (
							<>
								<Check className="mr-2 h-4 w-4" />
								Skip (don&apos;t add)
							</>
						)}
					</Button>
					<Button variant="ghost" onClick={onCancel} disabled={isSaving}>
						<X className="mr-2 h-4 w-4" />
						Cancel
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
