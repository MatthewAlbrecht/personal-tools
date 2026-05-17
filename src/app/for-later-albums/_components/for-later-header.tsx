"use client";

import { useMutation } from "convex/react";
import {
	DatabaseBackup,
	ExternalLink,
	MoreHorizontal,
	RefreshCw,
	Search,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { api } from "../../../../convex/_generated/api";
import type { ForLaterAlbumRowData } from "../_utils/types";
import { openVisibleRymLinks } from "./open-rym-links-button";

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

type ProjectionBackfillBatchResult = {
	continueCursor: string;
	isDone: boolean;
	processed: number;
};

export function ForLaterHeader({
	userId,
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
	const [isBackfilling, setIsBackfilling] = useState(false);

	const runBackfillBatch = useMutation(
		api.forLaterAlbums.runBackfillFilterProjectionBatch,
	);

	const isBusy = isSyncing || isFinding || isBackfilling;

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

	async function handleBackfillProjections(): Promise<void> {
		setIsBackfilling(true);
		const toastId = "for-later-projection-backfill";
		let cursor: string | null = null;
		let total = 0;
		let batches = 0;
		try {
			toast.loading("Backfilling filter fields…", { id: toastId });
			for (;;) {
				batches += 1;
				const batchResult: ProjectionBackfillBatchResult =
					await runBackfillBatch({ cursor, limit: 100 });
				total += batchResult.processed;
				toast.loading(
					`Backfilling… ${total} row${total === 1 ? "" : "s"} (batch ${batches})`,
					{ id: toastId },
				);
				if (batchResult.isDone) {
					break;
				}
				cursor = batchResult.continueCursor;
			}
			toast.success(
				`Updated filter fields for ${total} row${total === 1 ? "" : "s"}`,
				{ id: toastId },
			);
		} catch (error) {
			console.error("Projection backfill failed:", error);
			toast.error("Could not finish filter field backfill", { id: toastId });
		} finally {
			setIsBackfilling(false);
		}
	}

	return (
		<header className="space-y-4">
			<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
				<div className="min-w-0 flex-1">
					<h1 className="font-bold text-3xl">For Later Albums</h1>
					<p className="mt-2 text-muted-foreground text-sm">
						{summary ? (
							<>
								{summary.activeCount} active
								{summary.removedCount > 0
									? ` · ${summary.removedCount} removed`
									: ""}
								{spotifyDisplayName ? ` · ${spotifyDisplayName}` : ""}
								{summary.lastSync ? (
									<>
										{" · "}
										Last sync {formatDateTime(summary.lastSync.completedAt)}
										{summary.lastSync.status === "failed" &&
										summary.lastSync.error
											? ` (failed: ${summary.lastSync.error})`
											: ""}
									</>
								) : null}
							</>
						) : (
							"Loading summary…"
						)}
					</p>
				</div>
				<div className="flex shrink-0 justify-end">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								type="button"
								variant="outline"
								size="icon"
								className="size-9"
								aria-label="Open actions menu"
							>
								<MoreHorizontal className="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-56">
							<DropdownMenuLabel>Actions</DropdownMenuLabel>
							<DropdownMenuItem
								disabled={!isConnected || isBusy}
								onSelect={() => void handleSyncNow()}
							>
								<RefreshCw className="size-4" />
								{isSyncing ? "Syncing…" : "Sync now"}
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={isBusy}
								onSelect={() => void handleFindRymLinks()}
							>
								<Search className="size-4" />
								{isFinding ? "Finding…" : "Find RYM links"}
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={openableLinks.length === 0 || isBusy}
								onSelect={() => openVisibleRymLinks(openableLinks)}
							>
								<ExternalLink className="size-4" />
								Open {openableLinks.length} Google RYM tab
								{openableLinks.length === 1 ? "" : "s"}
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={isBusy}
								onSelect={() => void handleBackfillProjections()}
							>
								<DatabaseBackup className="size-4" />
								{isBackfilling ? "Backfilling…" : "Backfill filter fields"}
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuLabel className="text-xs">
								Tabs per open
							</DropdownMenuLabel>
							<DropdownMenuRadioGroup
								value={String(batchSize)}
								onValueChange={(value) =>
									onBatchSizeChange(Number.parseInt(value, 10) as 5 | 10 | 20)
								}
							>
								<DropdownMenuRadioItem value="5">5 tabs</DropdownMenuRadioItem>
								<DropdownMenuRadioItem value="10">
									10 tabs
								</DropdownMenuRadioItem>
								<DropdownMenuRadioItem value="20">
									20 tabs
								</DropdownMenuRadioItem>
							</DropdownMenuRadioGroup>
						</DropdownMenuContent>
					</DropdownMenu>
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
