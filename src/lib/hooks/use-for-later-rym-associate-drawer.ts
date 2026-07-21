"use client";

import { useMutation } from "convex/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { ForLaterAlbumRowData } from "~/app/for-later-albums/_utils/types";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type OptimisticForLaterRymLink = {
	rymStatus: "matched";
	rymUrl: string;
};

export function useForLaterRymAssociateDrawer({
	userId,
}: {
	userId: string | null;
}) {
	const [row, setRow] = useState<ForLaterAlbumRowData | null>(null);
	const [optimisticRymLinks, setOptimisticRymLinks] = useState(
		() => new Map<string, OptimisticForLaterRymLink>(),
	);
	const associateMutation = useMutation(
		api.forLaterAlbums.associateForLaterAlbumWithRymScrape,
	);

	const openAssociateDrawer = useCallback((albumRow: ForLaterAlbumRowData) => {
		setRow(albumRow);
	}, []);

	const closeAssociateDrawer = useCallback(() => {
		setRow(null);
	}, []);

	const handleAssociate = useCallback(
		async (selection: {
			scrapeId: Id<"rateYourMusicScrapes">;
			rymUrl: string;
		}): Promise<void> => {
			if (!userId || !row) {
				return;
			}

			const albumId = row.albumId;
			const albumName = row.name;

			setOptimisticRymLinks((current) => {
				const next = new Map(current);
				next.set(albumId, {
					rymStatus: "matched",
					rymUrl: selection.rymUrl,
				});
				return next;
			});
			setRow(null);

			try {
				await associateMutation({
					userId,
					albumId,
					scrapeId: selection.scrapeId,
				});
				toast.success(`Linked RYM page for "${albumName}"`);
			} catch (error) {
				setOptimisticRymLinks((current) => {
					const next = new Map(current);
					next.delete(albumId);
					return next;
				});
				console.error("Failed to associate RYM scrape:", error);
				toast.error("Could not link RYM scrape");
			}
		},
		[associateMutation, row, userId],
	);

	return {
		associateRow: row,
		openAssociateDrawer,
		closeAssociateDrawer,
		handleAssociate,
		optimisticRymLinks,
	};
}
