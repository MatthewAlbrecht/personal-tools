"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { toast } from "sonner";
import type { Id } from "../../../../convex/_generated/dataModel";

export function CheckTracksDialog({
	yearId,
	yearName,
	accessToken,
}: {
	yearId: Id<"rooYears">;
	yearName: string;
	accessToken: string | null;
}) {
	const [open, setOpen] = useState(false);
	const [days, setDays] = useState(30);
	const [isLoading, setIsLoading] = useState(false);

	async function handleCheck() {
		if (!accessToken) {
			toast.error("No access token available");
			return;
		}

		setIsLoading(true);

		try {
			const response = await fetch("/api/spotify/check-new-tracks", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ yearId, accessToken, days }),
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to check for new tracks");
			}

			const { stats } = data;
			toast.success(
				`Found ${stats.tracksAdded} new tracks (${stats.artistsChecked} artists checked, ${stats.tracksSkipped} already added)`,
			);
			setOpen(false);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to check for new tracks",
			);
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					<RefreshCw className="mr-2 h-4 w-4" />
					Check for New Tracks
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Check for New Tracks</DialogTitle>
					<DialogDescription>
						Scan all {yearName} artists for new releases and add them to the
						playlist.
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4 py-4">
					<div className="grid gap-2">
						<Label htmlFor="days">Look back (days)</Label>
						<Input
							id="days"
							type="number"
							min={1}
							max={365}
							value={days}
							onChange={(e) => setDays(Number(e.target.value))}
						/>
						<p className="text-muted-foreground text-sm">
							Only releases from the last {days} days will be considered.
						</p>
					</div>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button onClick={handleCheck} disabled={isLoading}>
						{isLoading ? (
							<>
								<RefreshCw className="mr-2 h-4 w-4 animate-spin" />
								Checking...
							</>
						) : (
							"Check Now"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
