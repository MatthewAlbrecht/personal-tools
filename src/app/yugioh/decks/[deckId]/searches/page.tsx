import type * as React from "react";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { SearchesPage } from "../../../_components/searches-page";

export default async function YugiohDeckSearchesPage({
	params,
}: {
	params: Promise<{ deckId: string }>;
}): Promise<React.ReactElement> {
	const { deckId } = await params;
	return <SearchesPage deckId={deckId as Id<"yugiohDecks">} />;
}
