"use client";

import { RefreshCw } from "lucide-react";
import { cn, formatRelativeTime } from "~/lib/utils";

const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const VERY_STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

type SyncAlbumsButtonProps = {
	isSyncing: boolean;
	onSync: () => void;
	variant?: "ghost" | "outline" | "status";
	className?: string;
	lastSyncedAt?: number;
};

export function SyncAlbumsButton({
	isSyncing,
	onSync,
	variant = "ghost",
	className,
	lastSyncedAt,
}: SyncAlbumsButtonProps) {
	if (variant === "status") {
		return (
			<SyncStatusControl
				isSyncing={isSyncing}
				onSync={onSync}
				lastSyncedAt={lastSyncedAt}
				className={className}
			/>
		);
	}

	const baseStyles = "flex items-center gap-1.5 text-sm disabled:opacity-50";

	const variantStyles = {
		ghost: "text-muted-foreground hover:text-foreground",
		outline: "rounded-md border px-3 py-1.5 hover:bg-accent",
	};

	return (
		<div className="flex items-center gap-3">
			{lastSyncedAt ? (
				<span className="text-muted-foreground text-xs">
					Synced {formatRelativeTime(lastSyncedAt)}
				</span>
			) : null}
			<button
				type="button"
				onClick={onSync}
				disabled={isSyncing}
				className={cn(baseStyles, variantStyles[variant], className)}
			>
				<RefreshCw className={cn("h-3.5 w-3.5", isSyncing && "animate-spin")} />
				{isSyncing ? "Syncing..." : "Sync Albums"}
			</button>
		</div>
	);
}

function SyncStatusControl({
	isSyncing,
	onSync,
	lastSyncedAt,
	className,
}: {
	isSyncing: boolean;
	onSync: () => void;
	lastSyncedAt?: number;
	className?: string;
}) {
	const ageMs =
		lastSyncedAt !== undefined ? Date.now() - lastSyncedAt : undefined;
	const isVeryStale = ageMs !== undefined && ageMs >= VERY_STALE_AFTER_MS;
	const isStale = ageMs !== undefined && ageMs >= STALE_AFTER_MS;

	return (
		<div className={cn("flex flex-col gap-1.5", className)}>
			{lastSyncedAt !== undefined ? (
				<p
					className={cn(
						"font-medium text-[0.65rem] tracking-wide",
						isVeryStale
							? "text-amber-800"
							: isStale
								? "text-amber-700/80"
								: "text-muted-foreground",
					)}
				>
					<span className="uppercase tracking-[0.14em]">Synced</span>{" "}
					<span className="font-normal tabular-nums">
						{formatRelativeTime(lastSyncedAt)}
					</span>
				</p>
			) : (
				<p className="font-medium text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]">
					Never synced
				</p>
			)}
			<button
				type="button"
				onClick={onSync}
				disabled={isSyncing}
				className={cn(
					"inline-flex w-fit items-center gap-1.5 rounded-sm text-left text-xs transition-colors disabled:opacity-50",
					isVeryStale || isStale
						? "font-medium text-amber-900 hover:text-amber-950"
						: "text-muted-foreground hover:text-foreground",
				)}
			>
				<RefreshCw className={cn("h-3 w-3", isSyncing && "animate-spin")} />
				{isSyncing ? "Syncing…" : "Sync now"}
			</button>
		</div>
	);
}
