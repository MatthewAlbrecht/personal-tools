"use client";

import { useMutation } from "convex/react";
import {
	DatabaseBackup,
	ExternalLink,
	MoreHorizontal,
	RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { api } from "../../../../convex/_generated/api";
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
	openableLinks,
}: {
	userId: string;
	spotifyDisplayName?: string;
	isConnected: boolean;
	getValidAccessToken: () => Promise<string | null>;
	summary?: ForLaterSummary;
	openableLinks: Array<{ id: string; url: string }>;
}) {
	const [isSyncing, setIsSyncing] = useState(false);
	const [isBackfilling, setIsBackfilling] = useState(false);

	const runBackfillBatch = useMutation(
		api.forLaterAlbums.runBackfillFilterProjectionBatch,
	);

	const isBusy = isSyncing || isBackfilling;

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
