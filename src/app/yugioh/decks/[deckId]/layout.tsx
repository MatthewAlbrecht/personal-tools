import type * as React from "react";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { DeckShell } from "../../_components/deck-shell";

export default async function YugiohDeckLayout({
	params,
	children,
}: {
	params: Promise<{ deckId: string }>;
	children: React.ReactNode;
}): Promise<React.ReactElement> {
	const { deckId } = await params;
	return <DeckShell deckId={deckId as Id<"yugiohDecks">}>{children}</DeckShell>;
}
