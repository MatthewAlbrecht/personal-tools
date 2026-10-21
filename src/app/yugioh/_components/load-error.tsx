"use client";

import { CircleAlert, RotateCw } from "lucide-react";
import type * as React from "react";
import { Button } from "~/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "~/components/ui/empty";

/** Shared body for the /yugioh error boundaries. */
export function LoadError({
	message,
	reset,
}: {
	message: string;
	reset: () => void;
}): React.ReactElement {
	return (
		<Empty className="mx-auto w-full max-w-5xl border">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<CircleAlert />
				</EmptyMedia>
				<EmptyTitle>{message}</EmptyTitle>
			</EmptyHeader>
			<EmptyContent>
				<Button variant="outline" onClick={reset}>
					<RotateCw data-icon="inline-start" />
					Try again
				</Button>
			</EmptyContent>
		</Empty>
	);
}
