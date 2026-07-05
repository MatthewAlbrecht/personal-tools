"use client";

import { RefreshCw, Settings } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

type MusicFunnelTab = "timeline" | "repeats";

type MusicFunnelSummary = {
	activeSourceCount: number;
	totalEncounterCount: number;
	lastRun: {
		status: "success" | "partial" | "failed";
		startedAt: number;
		completedAt?: number;
		newEncounters: number;
		newTracksAddedToMain: number;
		repeatTracksAdded: number;
		errors: string[];
	} | null;
};

export function MusicFunnelHeader({
	userId,
	spotifyDisplayName,
	summary,
	activeTab,
	onTabChange,
	onOpenConfig,
}: {
	userId: string;
	spotifyDisplayName?: string;
	summary?: MusicFunnelSummary;
	activeTab: MusicFunnelTab;
	onTabChange: (tab: MusicFunnelTab) => void;
	onOpenConfig: () => void;
}) {
	const [isSyncing, setIsSyncing] = useState(false);

	async function handleSync(): Promise<void> {
		setIsSyncing(true);
		try {
			const response = await fetch("/api/music-funnel/sync", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ userId }),
			});
			const result = (await response.json()) as {
				status?: "success" | "partial" | "failed";
				newEncounters?: number;
				repeatTracksAdded?: number;
				errors?: string[];
				error?: string;
				message?: string;
			};
			if (!response.ok) {
				throw new Error(
					result.errors?.[0] ??
						result.message ??
						result.error ??
						"Music funnel sync failed",
				);
			}
			if (result.status === "partial") {
				toast.warning("Music funnel synced with some source errors");
			} else if ((result.newEncounters ?? 0) === 0 && response.ok) {
				toast.info("Sync complete — no new tracks from any source");
			} else {
				toast.success(
					`Music funnel synced: ${result.newEncounters ?? 0} new, ${result.repeatTracksAdded ?? 0} repeats`,
				);
			}
		} catch (error) {
			console.error("Music funnel sync failed:", error);
			toast.error(
				error instanceof Error ? error.message : "Could not sync music funnel",
			);
		} finally {
			setIsSyncing(false);
		}
	}

	return (
		<header className="space-y-4">
			<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
				<div>
					<h1 className="font-bold text-3xl">Music Funnel</h1>
					<p className="mt-2 text-muted-foreground text-sm">
						{summary
							? `${summary.activeSourceCount} active sources · ${summary.totalEncounterCount} encounters${spotifyDisplayName ? ` · ${spotifyDisplayName}` : ""}${summary.lastRun?.completedAt ? ` · Last sync ${new Date(summary.lastRun.completedAt).toLocaleString()}` : ""}`
							: "Loading music funnel summary..."}
					</p>
				</div>
				<div className="flex shrink-0 gap-2">
					<Button type="button" variant="outline" onClick={onOpenConfig}>
						<Settings className="size-4" />
						Config
					</Button>
					<Button
						type="button"
						onClick={() => void handleSync()}
						disabled={isSyncing || summary?.activeSourceCount === 0}
						title={
							summary?.activeSourceCount === 0
								? "Add at least one active source in Config"
								: undefined
						}
					>
						<RefreshCw
							className={isSyncing ? "size-4 animate-spin" : "size-4"}
						/>
						{isSyncing ? "Syncing..." : "Sync now"}
					</Button>
				</div>
			</div>
			<div className="flex gap-1 rounded-lg bg-muted p-1">
				<button
					type="button"
					onClick={() => onTabChange("timeline")}
					className={cn(
						"flex-1 rounded-md px-3 py-2 font-medium text-sm transition-colors",
						activeTab === "timeline"
							? "bg-background shadow-sm"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					Timeline
				</button>
				<button
					type="button"
					onClick={() => onTabChange("repeats")}
					className={cn(
						"flex-1 rounded-md px-3 py-2 font-medium text-sm transition-colors",
						activeTab === "repeats"
							? "bg-background shadow-sm"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					Repeats
				</button>
			</div>
		</header>
	);
}
