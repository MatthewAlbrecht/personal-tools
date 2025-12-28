"use client";

import { RefreshCw } from "lucide-react";
import { cn } from "~/lib/utils";

type SyncAlbumsButtonProps = {
	isSyncing: boolean;
	onSync: () => void;
	variant?: "ghost" | "outline";
	className?: string;
};

export function SyncAlbumsButton({
	isSyncing,
	onSync,
	variant = "ghost",
	className,
}: SyncAlbumsButtonProps) {
	const baseStyles = "flex items-center gap-1.5 text-sm disabled:opacity-50";

	const variantStyles = {
		ghost: "text-muted-foreground hover:text-foreground",
		outline: "rounded-md border px-3 py-1.5 hover:bg-accent",
	};

	return (
		<button
			type="button"
			onClick={onSync}
			disabled={isSyncing}
			className={cn(baseStyles, variantStyles[variant], className)}
		>
			<RefreshCw className={cn("h-3.5 w-3.5", isSyncing && "animate-spin")} />
			{isSyncing ? "Syncing..." : "Sync Albums"}
		</button>
	);
}
