"use client";

import { useQuery } from "convex/react";
import { Clock } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { useMinuteClock } from "~/lib/hooks/use-minute-clock";
import { captureStaleness } from "~/lib/yugioh/run-format";
import { api } from "../../../../convex/_generated/api";

/**
 * The Deck header's "Last captured 9h ago", once no capture has seen a
 * Listing for over 6 hours. Links to the automated runs in Settings.
 */
export function CaptureStalenessNote(): React.ReactElement | null {
	const lastCapturedAt = useQuery(api.yugioh.automation.getLastCapturedAt, {});
	const now = useMinuteClock();
	const note =
		lastCapturedAt === undefined ? null : captureStaleness(lastCapturedAt, now);
	if (note === null) return null;
	return (
		<p className="flex gap-1.5 text-muted-foreground text-sm">
			<Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
			<Link
				href="/yugioh/settings#automated-runs"
				className="rounded-sm underline decoration-muted-foreground/50 underline-offset-4 outline-none hover:text-foreground hover:decoration-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
			>
				{note}
			</Link>
		</p>
	);
}
