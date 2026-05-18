"use client";

import { useMutation } from "convex/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { ForLaterAlbumRowData } from "~/app/for-later-albums/_utils/types";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export function useForLaterRymAssociateDrawer({
	userId,
}: {
	userId: string | null;
}) {
	const [row, setRow] = useState<ForLaterAlbumRowData | null>(null);
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
		async (scrapeId: Id<"rateYourMusicScrapes">): Promise<void> => {
			if (!userId || !row) {
				return;
			}

			const albumName = row.name;

			try {
				await associateMutation({
					userId,
					itemId: row.albumItemId,
					scrapeId,
				});
				setRow(null);
				toast.success(`Linked RYM page for "${albumName}"`);
			} catch (error) {
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
	};
}
