"use client";

import { useMutation } from "convex/react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

type Artist = {
	_id: Id<"rooArtists">;
	artistId: Id<"spotifyArtists">;
	spotifyArtistId: string;
	addedAt: number;
	artist: {
		_id: Id<"spotifyArtists">;
		spotifyArtistId: string;
		name: string;
		imageUrl?: string;
	} | null;
};

export function ArtistList({
	artists,
	yearId,
}: {
	artists: Artist[];
	yearId: Id<"rooYears">;
}) {
	const removeArtist = useMutation(api.rooleases.removeArtistFromYear);

	async function handleRemove(artistId: Id<"spotifyArtists">, name: string) {
		try {
			await removeArtist({ yearId, artistId });
			toast.success(`Removed ${name}`);
		} catch (error) {
			console.error("Failed to remove artist:", error);
			toast.error("Failed to remove artist");
		}
	}

	return (
		<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
			{artists.map((ra) => {
				if (!ra.artist) return null;

				return (
					<div
						key={ra._id}
						className="group flex items-center justify-between rounded-lg border bg-card p-3 transition-colors hover:bg-accent/50"
					>
						<div className="flex items-center gap-3 overflow-hidden">
							{ra.artist.imageUrl ? (
								<img
									src={ra.artist.imageUrl}
									alt={ra.artist.name}
									className="h-10 w-10 rounded-full object-cover"
								/>
							) : (
								<div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
									<span className="font-medium text-muted-foreground text-sm">
										{ra.artist.name.charAt(0)}
									</span>
								</div>
							)}
							<span className="truncate font-medium text-sm">
								{ra.artist.name}
							</span>
						</div>

						<Button
							variant="ghost"
							size="icon"
							className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
							onClick={() => handleRemove(ra.artistId, ra.artist!.name)}
						>
							<Trash2 className="h-4 w-4 text-destructive" />
						</Button>
					</div>
				);
			})}
		</div>
	);
}
