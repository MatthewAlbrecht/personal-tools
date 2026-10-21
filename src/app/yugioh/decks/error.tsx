"use client";

import type * as React from "react";
import { LoadError } from "../_components/load-error";

// Catches errors from the [deckId] layout (DeckShell), which its own
// error.tsx can't: an error boundary only wraps the segments below it.
export default function DeckLayoutError({
	reset,
}: {
	error: Error;
	reset: () => void;
}): React.ReactElement {
	return <LoadError message="Couldn't load this Deck." reset={reset} />;
}
