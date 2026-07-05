"use client";

import { useMutation } from "convex/react";
import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { parseSpotifyPlaylistId } from "~/lib/parse-spotify-playlist-id";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { spotifyPlaylistIdInputProps } from "../_utils/spotify-playlist-id-input";

type SourceFormState = {
	sourceId?: Id<"musicFunnelSources">;
	spotifyPlaylistId: string;
	displayName: string;
	curatorName: string;
	notes: string;
	scheduleHint: string;
	isActive: boolean;
};

const emptyForm: SourceFormState = {
	spotifyPlaylistId: "",
	displayName: "",
	curatorName: "",
	notes: "",
	scheduleHint: "",
	isActive: true,
};

export function MusicFunnelSourcesCard({
	userId,
	sources,
}: {
	userId: string;
	sources: Doc<"musicFunnelSources">[] | undefined;
}) {
	const upsertSource = useMutation(api.musicFunnel.upsertSource);
	const setSourceActive = useMutation(api.musicFunnel.setSourceActive);
	const [form, setForm] = useState<SourceFormState>(emptyForm);
	const [isSaving, setIsSaving] = useState(false);

	function startCreate(): void {
		setForm(emptyForm);
	}

	function startEdit(source: Doc<"musicFunnelSources">): void {
		setForm({
			sourceId: source._id,
			spotifyPlaylistId: source.spotifyPlaylistId,
			displayName: source.displayName,
			curatorName: source.curatorName,
			notes: source.notes ?? "",
			scheduleHint: source.scheduleHint ?? "",
			isActive: source.isActive,
		});
	}

	async function handleSave(): Promise<void> {
		if (!form.spotifyPlaylistId.trim() || !form.displayName.trim()) {
			toast.error("Playlist ID and display name are required");
			return;
		}

		setIsSaving(true);
		const normalizedPlaylistId = parseSpotifyPlaylistId(form.spotifyPlaylistId);
		try {
			await upsertSource({
				userId,
				sourceId: form.sourceId,
				spotifyPlaylistId: normalizedPlaylistId,
				displayName: form.displayName,
				curatorName: form.curatorName || form.displayName,
				notes: form.notes,
				scheduleHint: form.scheduleHint,
				isActive: form.isActive,
			});
			toast.success(form.sourceId ? "Source updated" : "Source added");
			setForm(emptyForm);
		} catch (error) {
			console.error("Failed to save music funnel source:", error);
			toast.error("Could not save source");
		} finally {
			setIsSaving(false);
		}
	}

	async function handleToggleActive(
		source: Doc<"musicFunnelSources">,
	): Promise<void> {
		try {
			await setSourceActive({
				sourceId: source._id,
				isActive: !source.isActive,
			});
			toast.success(
				source.isActive ? "Source deactivated" : "Source activated",
			);
		} catch (error) {
			console.error("Failed to toggle source:", error);
			toast.error("Could not update source");
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Source playlists</CardTitle>
				<CardDescription>
					Curated Instagram recommendation playlists to scan on each sync.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				{sources === undefined ? (
					<p className="text-muted-foreground text-sm">Loading sources...</p>
				) : sources.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No sources yet. Add your first recommendation playlist below.
					</p>
				) : (
					<ul className="space-y-3">
						{sources.map((source) => (
							<li key={source._id} className="space-y-3 rounded-lg border p-3">
								<div className="min-w-0">
									<p className="font-medium">{source.displayName}</p>
									<p className="text-muted-foreground text-sm">
										{source.curatorName}
										{source.scheduleHint ? ` · ${source.scheduleHint}` : ""}
									</p>
									<p className="truncate text-muted-foreground text-xs">
										{source.spotifyPlaylistId}
										{source.lastTrackCount !== undefined
											? ` · ${source.lastTrackCount} tracks`
											: ""}
									</p>
									{!source.isActive ? (
										<p className="text-amber-600 text-xs dark:text-amber-400">
											Inactive
										</p>
									) : null}
								</div>
								<div className="flex gap-2">
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => startEdit(source)}
									>
										<Pencil className="size-4" />
										Edit
									</Button>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => void handleToggleActive(source)}
									>
										{source.isActive ? "Deactivate" : "Activate"}
									</Button>
								</div>
							</li>
						))}
					</ul>
				)}

				<div className="space-y-4 rounded-lg border p-4">
					<div className="flex items-center justify-between gap-2">
						<p className="font-medium text-sm">
							{form.sourceId ? "Edit source" : "Add source"}
						</p>
						{form.sourceId ? (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={startCreate}
							>
								<Plus className="size-4" />
								New
							</Button>
						) : null}
					</div>
					<div className="space-y-2">
						<Label htmlFor="source-playlist-id">Spotify playlist ID</Label>
						<Input
							id="source-playlist-id"
							value={form.spotifyPlaylistId}
							onChange={(event) =>
								setForm((prev) => ({
									...prev,
									spotifyPlaylistId: event.target.value,
								}))
							}
							placeholder="Spotify playlist ID or URL"
							{...spotifyPlaylistIdInputProps((spotifyPlaylistId) =>
								setForm((prev) => ({ ...prev, spotifyPlaylistId })),
							)}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="source-display-name">Display name</Label>
						<Input
							id="source-display-name"
							value={form.displayName}
							onChange={(event) =>
								setForm((prev) => ({
									...prev,
									displayName: event.target.value,
								}))
							}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="source-curator-name">Curator name</Label>
						<Input
							id="source-curator-name"
							value={form.curatorName}
							onChange={(event) =>
								setForm((prev) => ({
									...prev,
									curatorName: event.target.value,
								}))
							}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="source-schedule-hint">Schedule hint</Label>
						<Input
							id="source-schedule-hint"
							value={form.scheduleHint}
							onChange={(event) =>
								setForm((prev) => ({
									...prev,
									scheduleHint: event.target.value,
								}))
							}
							placeholder="e.g. Monday, Wednesday"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="source-notes">Notes</Label>
						<Textarea
							id="source-notes"
							value={form.notes}
							onChange={(event) =>
								setForm((prev) => ({ ...prev, notes: event.target.value }))
							}
							rows={2}
						/>
					</div>
					<label className="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={form.isActive}
							onChange={(event) =>
								setForm((prev) => ({ ...prev, isActive: event.target.checked }))
							}
						/>
						Active (included in sync)
					</label>
					<Button
						type="button"
						onClick={() => void handleSave()}
						disabled={isSaving}
					>
						{isSaving
							? "Saving..."
							: form.sourceId
								? "Update source"
								: "Add source"}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
