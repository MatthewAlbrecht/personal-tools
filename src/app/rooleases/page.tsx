"use client";

import { useMutation, useQuery } from "convex/react";
import { CalendarPlus, Music, Trash2, Users } from "lucide-react";
import { useEffect, useState } from "react";
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
	AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { LoginPrompt } from "~/components/login-prompt";
import { Button } from "~/components/ui/button";
import { useSpotifyAuth } from "~/lib/hooks/use-spotify-auth";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ArtistList } from "./_components/artist-list";
import { ArtistSearch } from "./_components/artist-search";
import { CheckTracksDialog } from "./_components/check-tracks-dialog";
import { CreateYearDrawer } from "./_components/create-year-drawer";
import { ImportPlaylistDialog } from "./_components/import-playlist-dialog";
import { RecentTracks } from "./_components/recent-tracks";

export default function RooleasesPage() {
	const { userId, isLoading: authLoading, getValidAccessToken } = useSpotifyAuth();
	const [isCreateYearOpen, setIsCreateYearOpen] = useState(false);
	const [isImportOpen, setIsImportOpen] = useState(false);
	const [selectedYearId, setSelectedYearId] = useState<Id<"rooYears"> | null>(
		null,
	);
	const [accessToken, setAccessToken] = useState<string | null>(null);

	const clearArtists = useMutation(api.rooleases.clearArtistsFromYear);

	// Get access token on mount (for check dialog)
	useEffect(() => {
		if (userId) {
			getValidAccessToken().then(setAccessToken).catch(console.error);
		}
	}, [userId, getValidAccessToken]);

	// Queries
	const years = useQuery(api.rooleases.getYears, {});
	const defaultYear = useQuery(api.rooleases.getDefaultYear, {});

	// Use selected year or default year
	const activeYearId = selectedYearId ?? defaultYear?._id ?? null;
	const activeYear =
		years?.find((y: { _id: Id<"rooYears"> }) => y._id === activeYearId) ?? defaultYear ?? null;

	const artists = useQuery(
		api.rooleases.getArtistsForYear,
		activeYearId ? { yearId: activeYearId } : "skip",
	);

	const recentTracks = useQuery(
		api.rooleases.getTracksAddedForYear,
		activeYearId ? { yearId: activeYearId, limit: 20 } : "skip",
	);

	// Loading state
	if (authLoading) {
		return (
			<div className="container mx-auto max-w-4xl p-4">
				<div className="flex h-64 items-center justify-center">
					<p className="text-muted-foreground">Loading...</p>
				</div>
			</div>
		);
	}

	// Auth required
	if (!userId) {
		return (
			<LoginPrompt
				icon={Music}
				message="Sign in to access Rooleases"
				redirectPath="/rooleases"
			/>
		);
	}

	const yearsList = years ?? [];
	const artistsList = artists ?? [];
	const tracksList = recentTracks ?? [];

	return (
		<div className="container mx-auto max-w-4xl p-4">
			{/* Header */}
			<div className="mb-6 flex items-center justify-between">
				<div>
					<h1 className="font-bold text-2xl">Rooleases</h1>
					<p className="text-muted-foreground text-sm">
						Track new releases from festival artists
					</p>
				</div>

				<div className="flex items-center gap-3">
					{/* Year Selector */}
					{yearsList.length > 0 && (
						<select
							value={activeYearId ?? ""}
							onChange={(e) =>
								setSelectedYearId(e.target.value as Id<"rooYears">)
							}
							className="rounded-md border bg-background px-3 py-1.5 text-sm"
						>
							{yearsList.map((yr) => (
								<option key={yr._id} value={yr._id}>
									{yr.year}
									{yr.isDefault ? " (default)" : ""}
								</option>
							))}
						</select>
					)}

					<Button
						variant="outline"
						size="sm"
						onClick={() => setIsCreateYearOpen(true)}
					>
						<CalendarPlus className="mr-2 h-4 w-4" />
						New Year
					</Button>
				</div>
			</div>

			{/* No Year State */}
			{!activeYear && (
				<div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
					<CalendarPlus className="mb-4 h-12 w-12 text-muted-foreground" />
					<h2 className="mb-2 font-medium text-lg">No Year Configured</h2>
					<p className="mb-4 text-muted-foreground text-sm">
						Create a year to start tracking artists
					</p>
					<Button onClick={() => setIsCreateYearOpen(true)}>
						<CalendarPlus className="mr-2 h-4 w-4" />
						Create Year
					</Button>
				</div>
			)}

			{/* Active Year Content */}
			{activeYear && (
				<div className="space-y-6">
					{/* Year Info Card */}
					<div className="rounded-lg border bg-card p-4">
						<div className="flex items-center justify-between">
							<div>
								<h2 className="font-semibold text-lg">
									{activeYear.year} Festival
								</h2>
								<p className="text-muted-foreground text-sm">
									Target playlist: {activeYear.targetPlaylistName}
								</p>
								{activeYear.lastCheckedAt && (
									<p className="text-muted-foreground text-xs">
										Last checked:{" "}
										{new Date(activeYear.lastCheckedAt).toLocaleString()}
									</p>
								)}
							</div>
							<div className="flex items-center gap-2">
								<CheckTracksDialog
									yearId={activeYear._id}
									yearName={String(activeYear.year)}
									accessToken={accessToken}
								/>
								<Button
									variant="outline"
									size="sm"
									onClick={() => setIsImportOpen(true)}
								>
									<Users className="mr-2 h-4 w-4" />
									Import from Playlist
								</Button>
							</div>
						</div>
					</div>

					{/* Artist Search */}
					{activeYearId && (
						<ArtistSearch yearId={activeYearId} getAccessToken={getValidAccessToken} />
					)}

					{/* Artist List */}
					<div>
						<div className="mb-3 flex items-center justify-between">
							<h3 className="font-medium">
								Artists ({artistsList.length})
							</h3>
							{artistsList.length > 0 && activeYearId && (
								<AlertDialog>
									<AlertDialogTrigger asChild>
										<Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
											<Trash2 className="mr-2 h-4 w-4" />
											Clear All
										</Button>
									</AlertDialogTrigger>
									<AlertDialogContent>
										<AlertDialogHeader>
											<AlertDialogTitle>Clear all artists?</AlertDialogTitle>
											<AlertDialogDescription>
												This will remove all {artistsList.length} artists from this year.
												This action cannot be undone.
											</AlertDialogDescription>
										</AlertDialogHeader>
										<AlertDialogFooter>
											<AlertDialogCancel>Cancel</AlertDialogCancel>
											<AlertDialogAction
												className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
												onClick={async () => {
													try {
														const result = await clearArtists({ yearId: activeYearId });
														toast.success(`Removed ${result.deleted} artists`);
													} catch (error) {
														console.error("Failed to clear artists:", error);
														toast.error("Failed to clear artists");
													}
												}}
											>
												Clear All Artists
											</AlertDialogAction>
										</AlertDialogFooter>
									</AlertDialogContent>
								</AlertDialog>
							)}
						</div>
						{artistsList.length === 0 ? (
							<div className="rounded-lg border border-dashed py-8 text-center">
								<Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
								<p className="text-muted-foreground text-sm">
									No artists added yet. Search above or import from a playlist.
								</p>
							</div>
						) : (
							<ArtistList
								artists={artistsList}
								yearId={activeYearId!}
							/>
						)}
					</div>

					{/* Recent Tracks */}
					<div>
						<h3 className="mb-3 font-medium">
							Recent Additions ({tracksList.length})
						</h3>
						{tracksList.length === 0 ? (
							<div className="rounded-lg border border-dashed py-8 text-center">
								<Music className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
								<p className="text-muted-foreground text-sm">
									No tracks added yet. New releases will appear here.
								</p>
							</div>
						) : (
							<RecentTracks tracks={tracksList} />
						)}
					</div>
				</div>
			)}

			{/* Drawers/Dialogs */}
			<CreateYearDrawer
				open={isCreateYearOpen}
				onOpenChange={setIsCreateYearOpen}
				getAccessToken={getValidAccessToken}
			/>

			{activeYearId && (
				<ImportPlaylistDialog
					open={isImportOpen}
					onOpenChange={setIsImportOpen}
					yearId={activeYearId}
					getAccessToken={getValidAccessToken}
				/>
			)}
		</div>
	);
}
