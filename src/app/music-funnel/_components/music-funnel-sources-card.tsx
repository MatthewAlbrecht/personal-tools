"use client";

import { useMutation } from "convex/react";
import { Pencil, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
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
import { MusicFunnelCuratorCombobox } from "./music-funnel-curator-combobox";

type SourceKind = "recurring" | "one_off";

type SourceFormState = {
	sourceId?: Id<"musicFunnelSources">;
	spotifyPlaylistId: string;
	displayName: string;
	curatorName: string;
	notes: string;
	scheduleHint: string;
	isActive: boolean;
	kind: SourceKind;
};

const emptyForm: SourceFormState = {
	spotifyPlaylistId: "",
	displayName: "",
	curatorName: "",
	notes: "",
	scheduleHint: "",
	isActive: true,
	kind: "recurring",
};

function sourceKind(source: Doc<"musicFunnelSources">): SourceKind {
	return source.kind ?? "recurring";
}

function sortSources(
	sources: Doc<"musicFunnelSources">[],
): Doc<"musicFunnelSources">[] {
	return [...sources].sort((a, b) => {
		const curatorCmp = a.curatorName.localeCompare(b.curatorName);
		if (curatorCmp !== 0) {
			return curatorCmp;
		}
		return a.displayName.localeCompare(b.displayName);
	});
}

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
	const [retryingSourceId, setRetryingSourceId] =
		useState<Id<"musicFunnelSources"> | null>(null);

	const curatorOptions = Array.from(
		new Set(
			(sources ?? []).map((source) => source.curatorName).filter(Boolean),
		),
	).sort((a, b) => a.localeCompare(b));

	const sortedSources =
		sources === undefined ? undefined : sortSources(sources);

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
			kind: sourceKind(source),
		});
	}

	async function syncSourceById(
		sourceId: Id<"musicFunnelSources">,
	): Promise<void> {
		const response = await fetch("/api/music-funnel/sync", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ userId, sourceId }),
		});
		const result = (await response.json()) as {
			errors?: string[];
			message?: string;
			error?: string;
		};
		if (!response.ok) {
			throw new Error(
				result.errors?.[0] ?? result.message ?? result.error ?? "Sync failed",
			);
		}
	}

	async function handleSave(): Promise<void> {
		if (!form.spotifyPlaylistId.trim() || !form.displayName.trim()) {
			toast.error("Playlist ID and display name are required");
			return;
		}

		setIsSaving(true);
		const normalizedPlaylistId = parseSpotifyPlaylistId(form.spotifyPlaylistId);
		const isCreatingOneOff = !form.sourceId && form.kind === "one_off";
		try {
			const sourceId = await upsertSource({
				userId,
				sourceId: form.sourceId,
				spotifyPlaylistId: normalizedPlaylistId,
				displayName: form.displayName,
				curatorName: form.curatorName || form.displayName,
				notes: form.notes,
				scheduleHint: form.scheduleHint,
				isActive: isCreatingOneOff ? true : form.isActive,
				kind: form.kind,
			});

			if (isCreatingOneOff) {
				try {
					await syncSourceById(sourceId);
					toast.success("One-off source synced");
				} catch (syncError) {
					console.error("One-off source sync failed:", syncError);
					toast.error(
						syncError instanceof Error
							? syncError.message
							: "Source saved but sync failed — use Retry sync",
					);
				}
			} else {
				toast.success(form.sourceId ? "Source updated" : "Source added");
			}
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

	async function handleRetrySync(
		source: Doc<"musicFunnelSources">,
	): Promise<void> {
		setRetryingSourceId(source._id);
		try {
			await syncSourceById(source._id);
			toast.success("One-off source synced");
		} catch (error) {
			console.error("Retry sync failed:", error);
			toast.error(
				error instanceof Error ? error.message : "Could not sync source",
			);
		} finally {
			setRetryingSourceId(null);
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
				{sortedSources === undefined ? (
					<p className="text-muted-foreground text-sm">Loading sources...</p>
				) : sortedSources.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No sources yet. Add your first recommendation playlist below.
					</p>
				) : (
					<ul className="space-y-3">
						{sortedSources.map((source) => {
							const kind = sourceKind(source);
							const isOneOff = kind === "one_off";
							const isCompletedOneOff = isOneOff && !source.isActive;
							const canRetryOneOff = isOneOff && source.isActive;

							return (
								<li
									key={source._id}
									className="space-y-3 rounded-lg border p-3"
								>
									<div className="min-w-0">
										<div className="flex flex-wrap items-center gap-2">
											<p className="font-medium">{source.displayName}</p>
											{isOneOff ? (
												<Badge variant="secondary">One-off</Badge>
											) : null}
											{isCompletedOneOff ? (
												<Badge variant="outline">Completed</Badge>
											) : null}
										</div>
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
										{!source.isActive && !isOneOff ? (
											<p className="text-amber-600 text-xs dark:text-amber-400">
												Inactive
											</p>
										) : null}
									</div>
									<div className="flex flex-wrap gap-2">
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => startEdit(source)}
										>
											<Pencil className="size-4" />
											Edit
										</Button>
										{canRetryOneOff ? (
											<Button
												type="button"
												variant="outline"
												size="sm"
												disabled={retryingSourceId === source._id}
												onClick={() => void handleRetrySync(source)}
											>
												<RefreshCw className="size-4" />
												{retryingSourceId === source._id
													? "Retrying..."
													: "Retry sync"}
											</Button>
										) : null}
										{!isOneOff ? (
											<Button
												type="button"
												variant="outline"
												size="sm"
												onClick={() => void handleToggleActive(source)}
											>
												{source.isActive ? "Deactivate" : "Activate"}
											</Button>
										) : null}
									</div>
								</li>
							);
						})}
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
						<Label>Kind</Label>
						<div className="flex gap-4">
							<label className="flex items-center gap-2 text-sm">
								<input
									type="radio"
									name="source-kind"
									checked={form.kind === "recurring"}
									onChange={() =>
										setForm((prev) => ({ ...prev, kind: "recurring" }))
									}
								/>
								Recurring
							</label>
							<label className="flex items-center gap-2 text-sm">
								<input
									type="radio"
									name="source-kind"
									checked={form.kind === "one_off"}
									onChange={() =>
										setForm((prev) => ({ ...prev, kind: "one_off" }))
									}
								/>
								One-off
							</label>
						</div>
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
						<Label>Curator name</Label>
						<MusicFunnelCuratorCombobox
							curators={curatorOptions}
							value={form.curatorName}
							onValueChange={(curatorName) =>
								setForm((prev) => ({ ...prev, curatorName }))
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
					{form.kind === "recurring" ? (
						<label className="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={form.isActive}
								onChange={(event) =>
									setForm((prev) => ({
										...prev,
										isActive: event.target.checked,
									}))
								}
							/>
							Active (included in sync)
						</label>
					) : null}
					<Button
						type="button"
						onClick={() => void handleSave()}
						disabled={isSaving}
					>
						{isSaving
							? form.kind === "one_off" && !form.sourceId
								? "Syncing..."
								: "Saving..."
							: form.sourceId
								? "Update source"
								: form.kind === "one_off"
									? "Add & sync"
									: "Add source"}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
