"use client";

import { Disc3 } from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { AvailableAlbum } from "../_utils/types";

export function AddAlbumDialog({
	open,
	onOpenChange,
	availableAlbums,
	entryCount,
	onAddAlbum,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	availableAlbums: AvailableAlbum[];
	entryCount: number;
	onAddAlbum: (albumId: Id<"spotifyAlbums">) => void;
}) {
	const [searchQuery, setSearchQuery] = useState("");

	const filteredAlbums = useMemo(() => {
		if (!searchQuery.trim()) return availableAlbums.slice(0, 50);
		const query = searchQuery.toLowerCase();
		return availableAlbums
			.filter(
				(album) =>
					album.name.toLowerCase().includes(query) ||
					album.artistName.toLowerCase().includes(query),
			)
			.slice(0, 50);
	}, [availableAlbums, searchQuery]);

	function handleAdd(albumId: Id<"spotifyAlbums">) {
		if (entryCount >= 50) {
			toast.error("Cannot add more than 50 albums");
			return;
		}
		onAddAlbum(albumId);
		toast.success("Album added");
		onOpenChange(false);
		setSearchQuery("");
	}

	function handleClose(nextOpen: boolean) {
		onOpenChange(nextOpen);
		if (!nextOpen) {
			setSearchQuery("");
		}
	}

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent className="max-h-[80vh] overflow-hidden sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Add Album</DialogTitle>
					<DialogDescription>
						Search your library and add an album to the list ({entryCount}/50).
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<Input
						placeholder="Search by album or artist..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
					/>

					<div className="max-h-80 space-y-1 overflow-y-auto">
						{filteredAlbums.length === 0 ? (
							<p className="py-8 text-center text-muted-foreground text-sm">
								No matching albums found.
							</p>
						) : (
							filteredAlbums.map((album) => (
								<Button
									key={album._id}
									type="button"
									variant="ghost"
									className="h-auto w-full justify-start gap-3 px-2 py-2"
									onClick={() => handleAdd(album._id)}
									disabled={entryCount >= 50}
								>
									<div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded bg-muted">
										{album.imageUrl ? (
											<Image
												src={album.imageUrl}
												alt={album.name}
												fill
												className="object-cover"
												sizes="36px"
											/>
										) : (
											<div className="flex h-full w-full items-center justify-center">
												<Disc3 className="h-4 w-4 text-muted-foreground" />
											</div>
										)}
									</div>
									<div className="min-w-0 text-left">
										<p className="truncate font-medium text-sm">{album.name}</p>
										<p className="truncate text-muted-foreground text-xs">
											{album.artistName}
										</p>
									</div>
								</Button>
							))
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
