"use client";

import { Loader2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import type { Id } from "../../../../convex/_generated/dataModel";

type ImportResult = {
	imported: number;
	duplicatesSkipped: number;
	totalTracks: number;
	truncated: number;
};

function extractPlaylistId(input: string): string | null {
	const urlMatch = input.match(/playlist\/([a-zA-Z0-9]+)/);
	if (urlMatch?.[1]) return urlMatch[1];

	const uriMatch = input.match(/spotify:playlist:([a-zA-Z0-9]+)/);
	if (uriMatch?.[1]) return uriMatch[1];

	if (/^[a-zA-Z0-9]+$/.test(input.trim())) {
		return input.trim();
	}

	return null;
}

export function ImportPlaylistDialog({
	open,
	onOpenChange,
	yearId,
	userId,
	hasExistingEntries,
	getAccessToken,
	onImported,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	yearId: Id<"robRankingYears">;
	userId: string;
	hasExistingEntries: boolean;
	getAccessToken: () => Promise<string | null>;
	onImported?: () => void;
}) {
	const [playlistUrl, setPlaylistUrl] = useState("");
	const [isImporting, setIsImporting] = useState(false);
	const [result, setResult] = useState<ImportResult | null>(null);
	const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);

	async function runImport() {
		const playlistId = extractPlaylistId(playlistUrl);
		if (!playlistId) {
			toast.error("Invalid playlist URL or ID");
			return;
		}

		setIsImporting(true);
		setResult(null);

		try {
			const accessToken = await getAccessToken();
			if (!accessToken) {
				toast.error("Not authenticated with Spotify");
				return;
			}

			const response = await fetch("/api/spotify/import-robs-top-50", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					playlistId,
					yearId,
					userId,
					accessToken,
				}),
			});

			if (!response.ok) {
				const error = (await response.json()) as { error?: string };
				throw new Error(error.error ?? "Failed to import playlist");
			}

			const data = (await response.json()) as ImportResult;
			setResult(data);
			onImported?.();

			const parts = [
				`Imported ${data.imported} albums`,
				data.duplicatesSkipped > 0
					? `${data.duplicatesSkipped} duplicates skipped`
					: null,
				data.truncated > 0 ? `${data.truncated} beyond top 50 ignored` : null,
			].filter(Boolean);

			toast.success(parts.join(" · "));
		} catch (error) {
			console.error("Import failed:", error);
			const message =
				error instanceof Error ? error.message : "Failed to import playlist";
			toast.error(message);
		} finally {
			setIsImporting(false);
			setShowReplaceConfirm(false);
		}
	}

	function handleImportClick() {
		if (!playlistUrl.trim()) return;
		if (hasExistingEntries) {
			setShowReplaceConfirm(true);
			return;
		}
		void runImport();
	}

	function handleClose() {
		onOpenChange(false);
		setTimeout(() => {
			setPlaylistUrl("");
			setResult(null);
		}, 200);
	}

	return (
		<>
			<Dialog open={open} onOpenChange={handleClose}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Import from Spotify Playlist</DialogTitle>
						<DialogDescription>
							Paste a playlist URL. Tracks are converted to albums in playlist
							order (duplicates skipped, max 50).
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4 py-4">
						<div className="space-y-2">
							<Label htmlFor="rob-playlist-url">Playlist URL or ID</Label>
							<Input
								id="rob-playlist-url"
								placeholder="https://open.spotify.com/playlist/..."
								value={playlistUrl}
								onChange={(e) => setPlaylistUrl(e.target.value)}
								disabled={isImporting}
							/>
						</div>

						{result && (
							<div className="rounded-lg border bg-muted/50 p-4">
								<h4 className="mb-2 font-medium text-sm">Import Complete</h4>
								<dl className="space-y-1 text-sm">
									<div className="flex justify-between">
										<dt className="text-muted-foreground">Albums imported:</dt>
										<dd>{result.imported}</dd>
									</div>
									<div className="flex justify-between">
										<dt className="text-muted-foreground">Tracks scanned:</dt>
										<dd>{result.totalTracks}</dd>
									</div>
									{result.duplicatesSkipped > 0 && (
										<div className="flex justify-between">
											<dt className="text-muted-foreground">
												Duplicates skipped:
											</dt>
											<dd>{result.duplicatesSkipped}</dd>
										</div>
									)}
									{result.truncated > 0 && (
										<div className="flex justify-between">
											<dt className="text-muted-foreground">Beyond top 50:</dt>
											<dd>{result.truncated}</dd>
										</div>
									)}
								</dl>
							</div>
						)}

						<div className="flex gap-2 pt-2">
							<Button
								variant="outline"
								className="flex-1"
								onClick={handleClose}
							>
								{result ? "Done" : "Cancel"}
							</Button>
							{!result && (
								<Button
									className="flex-1"
									onClick={handleImportClick}
									disabled={isImporting || !playlistUrl.trim()}
								>
									{isImporting ? (
										<>
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											Importing...
										</>
									) : (
										<>
											<Upload className="mr-2 h-4 w-4" />
											Import
										</>
									)}
								</Button>
							)}
						</div>
					</div>
				</DialogContent>
			</Dialog>

			<AlertDialog
				open={showReplaceConfirm}
				onOpenChange={setShowReplaceConfirm}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Replace existing list?</AlertDialogTitle>
						<AlertDialogDescription>
							This year already has albums. Importing will replace the entire
							list with the playlist contents.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={() => void runImport()}>
							Replace list
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
