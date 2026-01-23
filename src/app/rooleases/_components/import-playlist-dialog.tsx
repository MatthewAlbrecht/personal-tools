"use client";

import { Loader2, Upload } from "lucide-react";
import { useState } from "react";
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
import { Label } from "~/components/ui/label";
import type { Id } from "../../../../convex/_generated/dataModel";

type ImportResult = {
	success: boolean;
	tracksScanned: number;
	uniqueArtistsFound: number;
	artistsUpserted: { added: number; updated: number };
	artistsAddedToYear: { added: number; skipped: number };
};

export function ImportPlaylistDialog({
	open,
	onOpenChange,
	yearId,
	getAccessToken,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	yearId: Id<"rooYears">;
	getAccessToken: () => Promise<string | null>;
}) {
	const [playlistUrl, setPlaylistUrl] = useState("");
	const [isImporting, setIsImporting] = useState(false);
	const [result, setResult] = useState<ImportResult | null>(null);

	function extractPlaylistId(input: string): string | null {
		// Handle full URLs like https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
		const urlMatch = input.match(/playlist\/([a-zA-Z0-9]+)/);
		if (urlMatch?.[1]) return urlMatch[1];

		// Handle spotify:playlist:ID format
		const uriMatch = input.match(/spotify:playlist:([a-zA-Z0-9]+)/);
		if (uriMatch?.[1]) return uriMatch[1];

		// Handle plain ID
		if (/^[a-zA-Z0-9]+$/.test(input.trim())) {
			return input.trim();
		}

		return null;
	}

	async function handleImport() {
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
				setIsImporting(false);
				return;
			}

			const response = await fetch("/api/spotify/seed-artists", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					playlistId,
					yearId,
					accessToken,
				}),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error ?? "Failed to import artists");
			}

			const data = (await response.json()) as ImportResult;
			setResult(data);

			toast.success(
				`Imported ${data.artistsAddedToYear.added} artists from playlist`,
			);
		} catch (error) {
			console.error("Import failed:", error);
			const message =
				error instanceof Error ? error.message : "Failed to import artists";
			toast.error(message);
		} finally {
			setIsImporting(false);
		}
	}

	function handleClose() {
		onOpenChange(false);
		// Reset state after close animation
		setTimeout(() => {
			setPlaylistUrl("");
			setResult(null);
		}, 200);
	}

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Import Artists from Playlist</DialogTitle>
					<DialogDescription>
						Paste a Spotify playlist URL to import all artists from that
						playlist.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-4">
					{/* Input */}
					<div className="space-y-2">
						<Label htmlFor="playlist-url">Playlist URL or ID</Label>
						<Input
							id="playlist-url"
							placeholder="https://open.spotify.com/playlist/..."
							value={playlistUrl}
							onChange={(e) => setPlaylistUrl(e.target.value)}
							disabled={isImporting}
						/>
					</div>

					{/* Result */}
					{result && (
						<div className="rounded-lg border bg-muted/50 p-4">
							<h4 className="mb-2 font-medium text-sm">Import Complete</h4>
							<dl className="space-y-1 text-sm">
								<div className="flex justify-between">
									<dt className="text-muted-foreground">Tracks scanned:</dt>
									<dd>{result.tracksScanned}</dd>
								</div>
								<div className="flex justify-between">
									<dt className="text-muted-foreground">Unique artists:</dt>
									<dd>{result.uniqueArtistsFound}</dd>
								</div>
								<div className="flex justify-between">
									<dt className="text-muted-foreground">New artists added:</dt>
									<dd className="font-medium text-green-600">
										{result.artistsAddedToYear.added}
									</dd>
								</div>
								<div className="flex justify-between">
									<dt className="text-muted-foreground">Already existed:</dt>
									<dd>{result.artistsAddedToYear.skipped}</dd>
								</div>
							</dl>
						</div>
					)}

					{/* Actions */}
					<div className="flex gap-2 pt-2">
						<Button variant="outline" className="flex-1" onClick={handleClose}>
							{result ? "Done" : "Cancel"}
						</Button>
						{!result && (
							<Button
								className="flex-1"
								onClick={handleImport}
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
										Import Artists
									</>
								)}
							</Button>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
