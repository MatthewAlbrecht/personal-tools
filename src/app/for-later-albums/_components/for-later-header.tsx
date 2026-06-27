"use client";

import { useMutation } from "convex/react";
import {
	DatabaseBackup,
	ListMusic,
	MoreHorizontal,
	RefreshCw,
	Sparkles,
} from "lucide-react";
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
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { api } from "../../../../convex/_generated/api";

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
	onOpenRecommendationDrawer,
}: {
	userId: string;
	spotifyDisplayName?: string;
	isConnected: boolean;
	getValidAccessToken: () => Promise<string | null>;
	summary?: ForLaterSummary;
	onOpenRecommendationDrawer: () => void;
}) {
	const [syncMode, setSyncMode] = useState<"idle" | "incremental" | "full">(
		"idle",
	);
	const [isBackfilling, setIsBackfilling] = useState(false);
	const [fullSyncDialogOpen, setFullSyncDialogOpen] = useState(false);

	const runBackfillBatch = useMutation(
		api.forLaterAlbums.runBackfillFilterProjectionBatch,
	);

	const isBusy = syncMode !== "idle" || isBackfilling;

	async function runSync(fullPlaylist: boolean): Promise<void> {
		setSyncMode(fullPlaylist ? "full" : "incremental");
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
					fullPlaylist,
				}),
			});
			if (!response.ok) {
				throw new Error("Sync failed");
			}
			toast.success(
				fullPlaylist
					? "Full playlist sync completed"
					: "For Later Albums synced",
			);
		} catch (error) {
			console.error("For Later sync failed:", error);
			toast.error(
				fullPlaylist
					? "Could not complete full playlist sync"
					: "Could not sync For Later Albums",
			);
		} finally {
			setSyncMode("idle");
		}
	}

	async function handleSyncNow(): Promise<void> {
		await runSync(false);
	}

	async function handleFullPlaylistSync(): Promise<void> {
		setFullSyncDialogOpen(false);
		await runSync(true);
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
				<div className="flex shrink-0 justify-end gap-2">
					<Button
						type="button"
						onClick={onOpenRecommendationDrawer}
						disabled={summary !== undefined && summary.activeCount === 0}
					>
						<Sparkles className="size-4" />
						Recommend
					</Button>
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
								{syncMode === "incremental" ? "Syncing…" : "Sync now"}
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={!isConnected || isBusy}
								onSelect={(event) => {
									event.preventDefault();
									setFullSyncDialogOpen(true);
								}}
							>
								<ListMusic className="size-4" />
								{syncMode === "full" ? "Full syncing…" : "Full playlist sync"}
							</DropdownMenuItem>
							<DropdownMenuSeparator />
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

			<AlertDialog open={fullSyncDialogOpen} onOpenChange={setFullSyncDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Run full playlist sync?</AlertDialogTitle>
						<AlertDialogDescription>
							This fetches every track in the For Later playlist and refreshes
							all album data, including durations. It ignores the incremental
							sync cutoff and may take longer than a normal sync.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={() => void handleFullPlaylistSync()}>
							Run full sync
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
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
