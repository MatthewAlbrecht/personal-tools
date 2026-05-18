"use client";

import { Disc3 } from "lucide-react";
import { Button } from "~/components/ui/button";
import type { ForLaterAlbumRowData } from "../_utils/types";
import { ForLaterRow } from "./for-later-row";

export function ForLaterList({
	rows,
	userId,
	isLoading,
	isLoadingMore,
	canLoadMore,
	onLoadMore,
	onRateAlbum,
	onLinkRymAlbum,
	onAddGenreKey,
	onAddDescriptorKey,
}: {
	rows: ForLaterAlbumRowData[];
	userId: string;
	isLoading: boolean;
	isLoadingMore: boolean;
	canLoadMore: boolean;
	onLoadMore: () => void;
	onRateAlbum?: (row: ForLaterAlbumRowData) => void;
	onLinkRymAlbum?: (row: ForLaterAlbumRowData) => void;
	onAddGenreKey?: (key: string) => void;
	onAddDescriptorKey?: (key: string) => void;
}) {
	if (isLoading) {
		return (
			<div className="flex h-64 items-center justify-center">
				<p className="text-muted-foreground">Loading For Later albums...</p>
			</div>
		);
	}

	if (rows.length === 0) {
		return (
			<div className="flex h-64 items-center justify-center rounded-lg border border-dashed">
				<div className="text-center">
					<Disc3 className="mx-auto h-12 w-12 text-muted-foreground/50" />
					<p className="mt-4 text-muted-foreground">
						No albums match this view
					</p>
					<p className="mt-1 text-muted-foreground text-sm">
						Sync the playlist or loosen the filters to see albums.
					</p>
				</div>
			</div>
		);
	}

	return (
		<section className="space-y-3">
			{rows.map((row) => (
				<ForLaterRow
					key={row.id}
					row={row}
					userId={userId}
					onRate={
						onRateAlbum && row.userAlbumId ? () => onRateAlbum(row) : undefined
					}
					onLinkRym={onLinkRymAlbum ? () => onLinkRymAlbum(row) : undefined}
					onAddGenreKey={onAddGenreKey}
					onAddDescriptorKey={onAddDescriptorKey}
				/>
			))}
			{canLoadMore ? (
				<div className="flex justify-center pt-2">
					<Button
						type="button"
						variant="outline"
						onClick={onLoadMore}
						disabled={isLoadingMore}
					>
						{isLoadingMore ? "Loading..." : "Load more"}
					</Button>
				</div>
			) : null}
		</section>
	);
}
