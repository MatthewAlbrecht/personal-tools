"use client";

import { useQuery } from "convex/react";
import { CircleAlert, CircleCheck, CircleX } from "lucide-react";
import type * as React from "react";
import { Badge } from "~/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";
import { Spinner } from "~/components/ui/spinner";
import { useMinuteClock } from "~/lib/hooks/use-minute-clock";
import {
	type RunDayLines,
	type RunLines,
	describeRun,
	describeRunDay,
} from "~/lib/yugioh/run-format";
import { api } from "../../../../convex/_generated/api";

const KIND_LABELS = {
	ebayNewlyListed: "Newly Listed",
	ebaySold: "Sold",
	ebayEndingSoon: "Ending soon",
	tcgplayer: "TCGplayer",
} as const;

/**
 * Settings: the latest automated runs (docs/yugioh/automation.md), newest
 * first, each with when it ran, how it ended, what it visited and captured,
 * and the pages that failed.
 */
export function AutomatedRuns(): React.ReactElement {
	const runs = useQuery(api.yugioh.automation.listRuns, {});
	const now = useMinuteClock();

	return (
		<Card id="automated-runs">
			<CardHeader>
				<CardTitle>Automated runs</CardTitle>
				<CardDescription>
					Your Mac opens each Search and TCGplayer page in its own Chrome
					profile. It looks again about 20 minutes before a matched auction
					ends, so the alert shows a fresh price.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<RunTimingSection now={now} />
				<Separator />
				{runs === undefined ? (
					<AutomatedRunsSkeleton />
				) : runs.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No runs yet. Set them up with docs/yugioh/automation.md, or run{" "}
						<code className="font-mono text-[0.8125rem]">
							scripts/yugioh-automation/run.sh
						</code>{" "}
						by hand.
					</p>
				) : (
					<ol className="-my-3 flex flex-col divide-y">
						{runs.map((run) => (
							<RunRow
								key={run._id}
								lines={describeRun(run, now)}
								pageErrors={run.pageErrors}
							/>
						))}
					</ol>
				)}
			</CardContent>
		</Card>
	);
}

/** When full runs happen: the daily schedule, and today's slots. */
function RunTimingSection({ now }: { now: number }): React.ReactElement {
	const day = useQuery(api.yugioh.automation.getRunDay, {});

	return (
		<section
			aria-labelledby="run-timing-heading"
			className="flex flex-col gap-2"
		>
			<h3 id="run-timing-heading" className="font-medium text-[0.9375rem]">
				When it runs
			</h3>
			{day === undefined ? (
				<Skeleton className="h-4 w-full max-w-sm" />
			) : (
				<RunTimingText lines={describeRunDay(day, now)} />
			)}
		</section>
	);
}

function RunTimingText({
	lines,
}: {
	lines: RunDayLines;
}): React.ReactElement {
	return (
		<>
			<p className="text-muted-foreground text-sm">{lines.summary}</p>
			{lines.slots.length > 0 && (
				<ul aria-label="Today" className="flex flex-wrap gap-1.5">
					{lines.slots.map((time) => (
						<li key={time}>
							<Badge variant="secondary" className="font-normal tabular-nums">
								{time}
							</Badge>
						</li>
					))}
				</ul>
			)}
		</>
	);
}

function RunRow({
	lines,
	pageErrors,
}: {
	lines: RunLines;
	pageErrors: Array<{
		kind: keyof typeof KIND_LABELS;
		label: string;
		error: string;
	}>;
}): React.ReactElement {
	return (
		<li className="flex flex-col gap-1 py-3">
			<p className="font-medium text-[0.9375rem]">{lines.when}</p>
			<p className="flex items-start gap-1.5 text-sm">
				<ToneIcon tone={lines.tone} />
				<span>{lines.outcome}</span>
			</p>
			{lines.pages !== null && (
				<p className="text-muted-foreground text-xs tabular-nums">
					{lines.pages} · {lines.listings}
				</p>
			)}
			{pageErrors.length > 0 && (
				<ul className="mt-1 flex flex-col gap-1">
					{pageErrors.map((page) => (
						<li
							key={`${page.kind} ${page.label}`}
							className="flex flex-wrap items-baseline gap-x-1.5 text-xs"
						>
							<Badge variant="outline" className="font-normal">
								{KIND_LABELS[page.kind]}
							</Badge>
							<span className="font-mono text-[0.75rem] tracking-tight">
								{page.label}
							</span>
							<span className="text-muted-foreground">{page.error}</span>
						</li>
					))}
				</ul>
			)}
		</li>
	);
}

function ToneIcon({ tone }: { tone: RunLines["tone"] }): React.ReactElement {
	switch (tone) {
		case "running":
			return <Spinner className="mt-0.5 size-4 shrink-0" aria-hidden />;
		case "done":
			return (
				<CircleCheck
					className="mt-0.5 size-4 shrink-0 text-muted-foreground"
					aria-hidden
				/>
			);
		case "warn":
			return (
				<CircleAlert
					className="mt-0.5 size-4 shrink-0 text-muted-foreground"
					aria-hidden
				/>
			);
		case "failed":
			return (
				<CircleX
					className="mt-0.5 size-4 shrink-0 text-destructive"
					aria-hidden
				/>
			);
	}
}

export function AutomatedRunsSkeleton(): React.ReactElement {
	return (
		<div className="flex flex-col gap-4">
			{[0, 1, 2].map((row) => (
				<div key={row} className="flex flex-col gap-1.5">
					<Skeleton className="h-4 w-48" />
					<Skeleton className="h-4 w-32" />
					<Skeleton className="h-3 w-64" />
				</div>
			))}
		</div>
	);
}
