"use client";

import { Copy, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

export function ConcertsHeader({
	calendarUrl,
	isSyncing,
	onSync,
	selectedVenueCount,
}: {
	calendarUrl: string;
	isSyncing: boolean;
	onSync: () => void;
	selectedVenueCount: number;
}) {
	async function handleCopyCalendarUrl() {
		if (!calendarUrl) return;

		await navigator.clipboard.writeText(calendarUrl);
		toast.success("Calendar feed URL copied");
	}

	return (
		<div className="flex flex-col gap-2">
			<Link className="text-muted-foreground text-sm hover:underline" href="/">
				Back to tools
			</Link>
			<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
				<div className="min-w-0 flex-1">
					<h1 className="font-bold text-3xl tracking-tight">Concert Tracker</h1>
					<p className="text-muted-foreground">
						Track selected Denver venues, newly synced events, tickets, and
						interest.
					</p>
				</div>
				<div className="flex shrink-0 items-center justify-end gap-2">
					<Button
						disabled={selectedVenueCount === 0 || isSyncing}
						onClick={onSync}
						type="button"
					>
						{isSyncing ? "Syncing..." : "Sync selected venues"}
					</Button>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								aria-label="Open actions menu"
								className="size-9"
								size="icon"
								type="button"
								variant="outline"
							>
								<MoreHorizontal className="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-56">
							<DropdownMenuLabel>Actions</DropdownMenuLabel>
							<DropdownMenuItem
								disabled={!calendarUrl}
								onSelect={() => void handleCopyCalendarUrl()}
							>
								<Copy className="size-4" />
								{calendarUrl
									? "Copy calendar feed URL"
									: "No calendar feed yet"}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
		</div>
	);
}
