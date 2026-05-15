"use client";

import { RefreshCw, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import type { ForLaterAlbumRowData } from "../_utils/types";
import { OpenRymLinksButton } from "./open-rym-links-button";

type ForLaterSummary = {
	activeCount: number;
	removedCount: number;
	lastSync: {
		status: "success" | "failed";
		completedAt: number;
		error?: string;
		spotifyPlaylistId: string;
	} | null;
};

export function ForLaterHeader({
	userId,
	playlistName,
	spotifyDisplayName,
	isConnected,
	getValidAccessToken,
	summary,
	visibleRows,
	openableLinks,
	batchSize,
	onBatchSizeChange,
}: {
	userId: string;
	playlistName: string;
	spotifyDisplayName?: string;
	isConnected: boolean;
	getValidAccessToken: () => Promise<string | null>;
	summary?: ForLaterSummary;
	visibleRows: ForLaterAlbumRowData[];
	openableLinks: Array<{ id: string; url: string }>;
	batchSize: 5 | 10 | 20;
	onBatchSizeChange: (size: 5 | 10 | 20) => void;
}) {
	const [isSyncing, setIsSyncing] = useState(false);
	const [isFinding, setIsFinding] = useState(false);

	async function handleSyncNow(): Promise<void> {
		setIsSyncing(true);
		try {
			const accessToken = await getValidAccessToken();
			if (!accessToken) {
				toast.error("Connect Spotify before syncing");
				return;
			}
			const response = await fetch("/api/for-later-albums/sync", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Access-Token": accessToken,
				},
				body: JSON.stringify({
					userId,
					source: "manual",
					fullPlaylist: false,
				}),
			});
			if (!response.ok) {
				throw new Error("Sync failed");
			}
			toast.success("For Later Albums synced");
		} catch (error) {
			console.error("For Later sync failed:", error);
			toast.error("Could not sync For Later Albums");
		} finally {
			setIsSyncing(false);
		}
	}

	async function handleFindRymLinks(): Promise<void> {
		const ids = visibleRows
			.filter(
				(row) =>
					row.rymStatus !== "matched" &&
					row.rymStatus !== "searching" &&
					!row.rymUrl,
			)
			.slice(0, 10)
			.map((row) => row.albumItemId);

		if (ids.length === 0) {
			toast.message("No visible unmatched albums need RYM discovery");
			return;
		}

		setIsFinding(true);
		try {
			const response = await fetch("/api/for-later-albums/find-rym-links", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ userId, forLaterAlbumItemIds: ids }),
			});
			const data = (await response.json()) as {
				ok?: boolean;
				queued?: number;
				error?: string;
			};
			if (!response.ok) {
				throw new Error(data.error ?? "RYM link discovery failed");
			}
			const n = typeof data.queued === "number" ? data.queued : ids.length;
			toast.success(`Queued RYM discovery for ${n} album${n === 1 ? "" : "s"}`);
		} catch (error) {
			console.error("RYM discovery failed:", error);
			toast.error("Could not start RYM discovery");
		} finally {
			setIsFinding(false);
		}
	}

	return (
		<header className="space-y-4">
			<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
				<div>
					<h1 className="font-bold text-3xl">For Later Albums</h1>
					<p className="mt-2 text-muted-foreground">
						{playlistName}
						{spotifyDisplayName ? ` · ${spotifyDisplayName}` : ""}
					</p>
					<p className="mt-1 text-muted-foreground text-sm">
						{summary
							? `${summary.activeCount} active · ${summary.removedCount} removed`
							: "Loading backlog summary..."}
					</p>
					{summary?.lastSync ? (
						<p className="mt-1 text-muted-foreground text-sm">
							Last sync {formatDateTime(summary.lastSync.completedAt)}
							{summary.lastSync.status === "failed" && summary.lastSync.error
								? ` · Failed: ${summary.lastSync.error}`
								: ""}
						</p>
					) : null}
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<select
						value={batchSize}
						onChange={(event) =>
							onBatchSizeChange(
								Number.parseInt(event.target.value, 10) as 5 | 10 | 20,
							)
						}
						className="rounded-md border bg-background px-2 py-2 text-sm"
						aria-label="RYM open batch size"
					>
						<option value={5}>5 tabs</option>
						<option value={10}>10 tabs</option>
						<option value={20}>20 tabs</option>
					</select>
					<OpenRymLinksButton links={openableLinks} />
					<Button
						type="button"
						variant="outline"
						className="gap-2"
						onClick={() => void handleFindRymLinks()}
						disabled={isFinding}
					>
						<Search className="h-4 w-4" />
						{isFinding ? "Finding..." : "Find RYM links"}
					</Button>
					<Button
						type="button"
						className="gap-2"
						onClick={() => void handleSyncNow()}
						disabled={!isConnected || isSyncing}
					>
						<RefreshCw className="h-4 w-4" />
						{isSyncing ? "Syncing..." : "Sync now"}
					</Button>
				</div>
			</div>
		</header>
	);
}

function formatDateTime(timestamp: number): string {
	return new Date(timestamp).toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}
