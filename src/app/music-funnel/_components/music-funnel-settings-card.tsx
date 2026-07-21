"use client";

import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { parseSpotifyPlaylistId } from "~/lib/parse-spotify-playlist-id";
import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { spotifyPlaylistIdInputProps } from "../_utils/spotify-playlist-id-input";

export function MusicFunnelSettingsCard({
	userId,
	settings,
}: {
	userId: string;
	settings: Doc<"musicFunnelSettings"> | null | undefined;
}) {
	const upsertSettings = useMutation(api.musicFunnel.upsertSettings);
	const [mainPlaylistId, setMainPlaylistId] = useState("");
	const [repeatsPlaylistId, setRepeatsPlaylistId] = useState("");
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		setMainPlaylistId(settings?.mainPlaylistId ?? "");
		setRepeatsPlaylistId(settings?.repeatsPlaylistId ?? "");
	}, [settings]);

	async function handleSave(): Promise<void> {
		setIsSaving(true);
		const normalizedMain = parseSpotifyPlaylistId(mainPlaylistId);
		const normalizedRepeats = parseSpotifyPlaylistId(repeatsPlaylistId);
		setMainPlaylistId(normalizedMain);
		setRepeatsPlaylistId(normalizedRepeats);
		try {
			await upsertSettings({
				userId,
				mainPlaylistId: normalizedMain,
				repeatsPlaylistId: normalizedRepeats,
			});
			toast.success("Destination playlists saved");
		} catch (error) {
			console.error("Failed to save music funnel settings:", error);
			toast.error("Could not save destination playlists");
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<section className="space-y-5 border-b pb-6">
			<div className="space-y-1">
				<h3 className="font-semibold text-base">Destination playlists</h3>
				<p className="text-muted-foreground text-sm">
					Spotify playlist IDs where new discoveries and cross-source repeats
					are written.
				</p>
			</div>
			<div className="space-y-2">
				<Label htmlFor="main-playlist-id">Main funnel playlist ID</Label>
				<Input
					id="main-playlist-id"
					value={mainPlaylistId}
					onChange={(event) => setMainPlaylistId(event.target.value)}
					placeholder="Spotify playlist ID or URL"
					{...spotifyPlaylistIdInputProps(setMainPlaylistId)}
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor="repeats-playlist-id">Repeats playlist ID</Label>
				<Input
					id="repeats-playlist-id"
					value={repeatsPlaylistId}
					onChange={(event) => setRepeatsPlaylistId(event.target.value)}
					placeholder="Spotify playlist ID or URL"
					{...spotifyPlaylistIdInputProps(setRepeatsPlaylistId)}
				/>
			</div>
			<Button
				type="button"
				onClick={() => void handleSave()}
				disabled={isSaving}
			>
				{isSaving ? "Saving..." : "Save settings"}
			</Button>
		</section>
	);
}
