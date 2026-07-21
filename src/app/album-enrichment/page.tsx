"use client";

import { useQuery } from "convex/react";
import { RadioTower } from "lucide-react";
import { LoginPrompt } from "~/components/login-prompt";
import { useAuthToken } from "~/lib/hooks/use-auth-token";
import { api } from "../../../convex/_generated/api";
import { EnrichmentOverview } from "./_components/enrichment-overview";
import { IncompleteQueue } from "./_components/incomplete-queue";
import { RecentEnrichments } from "./_components/recent-enrichments";

export default function AlbumEnrichmentPage() {
	const { userId, isLoading: authLoading } = useAuthToken();
	const queueStatus = useQuery(
		api.albumEnrichment.getQueueStatus,
		userId ? { userId } : "skip",
	);
	const incompleteQueue = useQuery(
		api.albumEnrichment.listIncompleteQueue,
		userId ? { userId, limit: 25 } : "skip",
	);
	const recentEnrichments = useQuery(
		api.albumEnrichment.listRecentEnrichments,
		userId ? { limit: 10 } : "skip",
	);

	if (authLoading) {
		return <AlbumEnrichmentPageSkeleton />;
	}

	if (!userId) {
		return (
			<LoginPrompt
				icon={RadioTower}
				message="Please log in to view album enrichment operations"
				redirectPath="/album-enrichment"
			/>
		);
	}

	return (
		<main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
			<div className="space-y-6">
				<EnrichmentOverview status={queueStatus} />
				<div className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(20rem,0.85fr)]">
					<IncompleteQueue queue={incompleteQueue} />
					<RecentEnrichments rows={recentEnrichments} />
				</div>
			</div>
		</main>
	);
}

function AlbumEnrichmentPageSkeleton() {
	return (
		<main
			className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6"
			aria-busy="true"
		>
			<output className="sr-only" aria-live="polite">
				Checking authentication for album enrichment operations
			</output>
			<div className="space-y-6">
				<div className="h-36 animate-pulse rounded-xl border bg-muted/40" />
				<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
					{Array.from({ length: 4 }, (_, index) => (
						<div
							key={index}
							className="h-28 animate-pulse rounded-xl border bg-muted/40"
						/>
					))}
				</div>
				<div className="h-80 animate-pulse rounded-xl border bg-muted/40" />
			</div>
		</main>
	);
}
