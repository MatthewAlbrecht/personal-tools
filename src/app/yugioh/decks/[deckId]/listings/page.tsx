import type * as React from "react";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { ListingsPage } from "../../../_components/listings-page";

export default async function YugiohDeckListingsPage({
	params,
}: {
	params: Promise<{ deckId: string }>;
}): Promise<React.ReactElement> {
	const { deckId } = await params;
	return <ListingsPage deckId={deckId as Id<"yugiohDecks">} />;
}
