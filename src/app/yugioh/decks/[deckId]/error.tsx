"use client";

import type * as React from "react";
import { LoadError } from "../../_components/load-error";

export default function DeckError({
	reset,
}: {
	error: Error;
	reset: () => void;
}): React.ReactElement {
	return <LoadError message="Couldn't load this Deck." reset={reset} />;
}
