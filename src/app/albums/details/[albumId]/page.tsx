"use client";

import { useQuery } from "convex/react";
import { ArrowLeft, Disc3 } from "lucide-react";
import Link from "next/link";
import React, { Component, type ReactNode } from "react";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useAlbums } from "../../_context/albums-context";
import { AlbumDetailsView } from "./_components/album-details-view";

export default function AlbumDetailsPage({
	params,
}: {
	params: Promise<{ albumId: string }>;
}) {
	const { albumId } = React.use(params);

	return (
		<InvalidAlbumIdBoundary fallback={<AlbumDetailsNotFound />}>
			<AlbumDetailsPageContent albumId={albumId} />
		</InvalidAlbumIdBoundary>
	);
}

function AlbumDetailsPageContent({ albumId }: { albumId: string }) {
	const { userId } = useAlbums();

	const details = useQuery(
		api.albumEnrichment.getAlbumDetails,
		userId ? { userId, albumId: albumId as Id<"spotifyAlbums"> } : "skip",
	);

	if (details === undefined) {
		return <AlbumDetailsPageSkeleton />;
	}

	if (details === null) {
		return <AlbumDetailsNotFound />;
	}

	return <AlbumDetailsView details={details} />;
}

/**
 * `getAlbumDetails` validates `albumId` as `v.id("spotifyAlbums")` and throws
 * (rather than returning null) when the URL segment isn't a well-formed
 * Convex id at all. Catch that here so a garbage id still renders "not found"
 * instead of an unhandled runtime error.
 */
class InvalidAlbumIdBoundary extends Component<
	{ children: ReactNode; fallback: ReactNode },
	{ hasError: boolean }
> {
	state = { hasError: false };

	static getDerivedStateFromError() {
		return { hasError: true };
	}

	componentDidCatch(error: unknown) {
		console.error("Failed to load album details:", error);
	}

	render() {
		if (this.state.hasError) {
			return this.props.fallback;
		}
		return this.props.children;
	}
}

function AlbumDetailsPageSkeleton() {
	return (
		<div className="space-y-8">
			<div className="flex items-start gap-4">
				<Skeleton className="h-32 w-32 shrink-0 rounded-lg" />
				<div className="flex-1 space-y-2 py-1">
					<Skeleton className="h-7 w-2/3" />
					<Skeleton className="h-5 w-1/3" />
					<Skeleton className="h-4 w-1/4" />
				</div>
			</div>
			<Skeleton className="h-24 w-full" />
			<Skeleton className="h-40 w-full" />
		</div>
	);
}

function AlbumDetailsNotFound() {
	return (
		<div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed text-center">
			<Disc3 className="h-10 w-10 text-muted-foreground/50" />
			<p className="mt-4 text-muted-foreground">Album not found</p>
			<p className="mt-1 text-muted-foreground text-sm">
				This album doesn't exist or the link is broken.
			</p>
			<Button asChild variant="outline" className="mt-4">
				<Link href="/albums/all">
					<ArrowLeft className="h-4 w-4" />
					Back to albums
				</Link>
			</Button>
		</div>
	);
}
