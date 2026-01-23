"use client";

import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
} from "~/components/ui/drawer";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { getUserPlaylists, type SpotifyPlaylist } from "~/lib/spotify";
import { api } from "../../../../convex/_generated/api";

export function CreateYearDrawer({
	open,
	onOpenChange,
	getAccessToken,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	getAccessToken: () => Promise<string | null>;
}) {
	const [year, setYear] = useState(new Date().getFullYear());
	const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>("");
	const [isDefault, setIsDefault] = useState(true);
	const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
	const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
	const [isCreating, setIsCreating] = useState(false);

	const createYear = useMutation(api.rooleases.createYear);

	// Load playlists when drawer opens
	useEffect(() => {
		if (open && playlists.length === 0) {
			loadPlaylists();
		}
	}, [open]);

	async function loadPlaylists() {
		setIsLoadingPlaylists(true);
		try {
			const accessToken = await getAccessToken();
			if (!accessToken) {
				toast.error("Not authenticated with Spotify");
				return;
			}
			const result = await getUserPlaylists(accessToken);
			setPlaylists(result);
		} catch (error) {
			console.error("Failed to load playlists:", error);
			toast.error("Failed to load playlists");
		} finally {
			setIsLoadingPlaylists(false);
		}
	}

	async function handleCreate() {
		if (!selectedPlaylistId) {
			toast.error("Please select a target playlist");
			return;
		}

		const playlist = playlists.find((p) => p.id === selectedPlaylistId);
		if (!playlist) {
			toast.error("Please select a valid playlist");
			return;
		}

		setIsCreating(true);
		try {
			await createYear({
				year,
				targetPlaylistId: playlist.id,
				targetPlaylistName: playlist.name,
				isDefault,
			});

			toast.success(`Created ${year} festival year`);
			onOpenChange(false);

			// Reset form
			setYear(new Date().getFullYear());
			setSelectedPlaylistId("");
			setIsDefault(true);
		} catch (error) {
			console.error("Failed to create year:", error);
			const message =
				error instanceof Error ? error.message : "Failed to create year";
			toast.error(message);
		} finally {
			setIsCreating(false);
		}
	}

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent>
				<div className="mx-auto w-full max-w-md">
					<DrawerHeader>
						<DrawerTitle>Create Festival Year</DrawerTitle>
					</DrawerHeader>

					<div className="space-y-4 p-4">
						{/* Year Input */}
						<div className="space-y-2">
							<Label htmlFor="year">Year</Label>
							<Input
								id="year"
								type="number"
								value={year}
								onChange={(e) => setYear(Number(e.target.value))}
								min={2020}
								max={2030}
							/>
						</div>

						{/* Playlist Selector */}
						<div className="space-y-2">
							<Label htmlFor="playlist">Target Playlist</Label>
							{isLoadingPlaylists ? (
								<div className="flex items-center gap-2 text-muted-foreground text-sm">
									<Loader2 className="h-4 w-4 animate-spin" />
									Loading playlists...
								</div>
							) : (
								<select
									id="playlist"
									value={selectedPlaylistId}
									onChange={(e) => setSelectedPlaylistId(e.target.value)}
									className="w-full rounded-md border bg-background px-3 py-2 text-sm"
								>
									<option value="">Select a playlist...</option>
									{playlists.map((playlist) => (
										<option key={playlist.id} value={playlist.id}>
											{playlist.name}
										</option>
									))}
								</select>
							)}
							<p className="text-muted-foreground text-xs">
								New releases will be added to this playlist
							</p>
						</div>

						{/* Default Checkbox */}
						<div className="flex items-center gap-2">
							<Checkbox
								id="isDefault"
								checked={isDefault}
								onCheckedChange={(checked) => setIsDefault(checked === true)}
							/>
							<Label htmlFor="isDefault" className="text-sm">
								Set as default year
							</Label>
						</div>

						{/* Actions */}
						<div className="flex gap-2 pt-4">
							<Button
								variant="outline"
								className="flex-1"
								onClick={() => onOpenChange(false)}
							>
								Cancel
							</Button>
							<Button
								className="flex-1"
								onClick={handleCreate}
								disabled={isCreating || !selectedPlaylistId}
							>
								{isCreating ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Creating...
									</>
								) : (
									"Create Year"
								)}
							</Button>
						</div>
					</div>
				</div>
			</DrawerContent>
		</Drawer>
	);
}
