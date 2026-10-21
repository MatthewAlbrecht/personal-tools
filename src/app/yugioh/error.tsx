"use client";

import type * as React from "react";
import { LoadError } from "./_components/load-error";

export default function YugiohError({
	reset,
}: {
	error: Error;
	reset: () => void;
}): React.ReactElement {
	return <LoadError message="Couldn't load your Decks." reset={reset} />;
}
