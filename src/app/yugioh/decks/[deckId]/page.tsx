import type * as React from "react";
import { Suspense } from "react";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { DeckPage, DeckPageSkeleton } from "../../_components/deck-page";

export default async function YugiohDeckPage({
	params,
}: {
	params: Promise<{ deckId: string }>;
}): Promise<React.ReactElement> {
	const { deckId } = await params;
	return (
		// DeckPage reads `?card=` with useSearchParams, which needs a Suspense boundary.
		<Suspense fallback={<DeckPageSkeleton />}>
			<DeckPage deckId={deckId as Id<"yugiohDecks">} />
		</Suspense>
	);
}
