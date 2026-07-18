"use client";

import { useMutation, useQuery } from "convex/react";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { cn } from "~/lib/utils";
import { api } from "../../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../../convex/_generated/dataModel";
import type { EnrichmentSliceKey } from "../../../../../../convex/_utils/albumEnrichmentSlices";
import { formatRelativeTime } from "../../../_utils/formatters";

type Trial = Doc<"albumEnrichmentTrials">;
type AutoEval = NonNullable<Trial["autoEval"]>;
type HumanVerdict = NonNullable<Trial["humanVerdict"]>;

type TrialRunGroupData = {
	trialRunId: string;
	createdAt: number;
	bySlice: Array<{ slice: EnrichmentSliceKey; trials: Trial[] }>;
};

const SLICE_LABELS: Record<EnrichmentSliceKey, string> = {
	artistContext: "Artist context",
	whyListen: "Why listen",
	coverDescriptors: "Cover tags",
	occasions: "Occasions",
};

export function EnrichmentTrials({
	albumId,
}: {
	albumId: Id<"spotifyAlbums">;
}) {
	const trials = useQuery(api.albumEnrichmentTrials.listTrialsForAlbum, {
		albumId,
	});

	if (!trials || trials.length === 0) {
		return null;
	}

	const runs = groupTrialsByRun(trials);

	return (
		<>
			<Separator />
			<div className="space-y-4">
				<h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
					Enrichment trials
				</h2>
				<div className="space-y-4">
					{runs.map((run) => (
						<TrialRunGroup key={run.trialRunId} run={run} />
					))}
				</div>
			</div>
		</>
	);
}

function groupTrialsByRun(trials: Trial[]): TrialRunGroupData[] {
	const runMap = new Map<string, Trial[]>();
	for (const trial of trials) {
		const existing = runMap.get(trial.trialRunId) ?? [];
		existing.push(trial);
		runMap.set(trial.trialRunId, existing);
	}

	const runs = Array.from(runMap.entries()).map(([trialRunId, runTrials]) => {
		const sliceMap = new Map<EnrichmentSliceKey, Trial[]>();
		for (const trial of runTrials) {
			const existing = sliceMap.get(trial.slice) ?? [];
			existing.push(trial);
			sliceMap.set(trial.slice, existing);
		}
		return {
			trialRunId,
			createdAt: Math.min(...runTrials.map((trial) => trial.createdAt)),
			bySlice: Array.from(sliceMap.entries()).map(([slice, sliceTrials]) => ({
				slice,
				trials: sliceTrials.sort((a, b) =>
					a.variantId.localeCompare(b.variantId),
				),
			})),
		};
	});

	return runs.sort((a, b) => b.createdAt - a.createdAt);
}

function TrialRunGroup({ run }: { run: TrialRunGroupData }) {
	return (
		<div className="space-y-4 rounded-lg border p-4">
			<div className="flex items-center justify-between gap-2">
				<p className="font-medium text-sm">Run {run.trialRunId}</p>
				<p className="text-muted-foreground text-xs">
					{formatRelativeTime(run.createdAt)}
				</p>
			</div>
			<div className="space-y-4">
				{run.bySlice.map(({ slice, trials }) => (
					<TrialSliceGroup key={slice} slice={slice} trials={trials} />
				))}
			</div>
		</div>
	);
}

function TrialSliceGroup({
	slice,
	trials,
}: {
	slice: EnrichmentSliceKey;
	trials: Trial[];
}) {
	return (
		<div className="space-y-2">
			<p className="text-muted-foreground text-xs">{SLICE_LABELS[slice]}</p>
			<div className="grid gap-3 sm:grid-cols-2">
				{trials.map((trial) => (
					<TrialCard key={trial._id} trial={trial} />
				))}
			</div>
		</div>
	);
}

function TrialCard({ trial }: { trial: Trial }) {
	const setVerdict = useMutation(api.albumEnrichmentTrials.setTrialVerdict);
	const promoteTrial = useMutation(api.albumEnrichmentTrials.promoteTrial);
	const [isPromoting, setIsPromoting] = useState(false);

	const isPromoted = trial.promotedAt != null;
	const verdict: HumanVerdict = trial.humanVerdict ?? "undecided";

	async function handleVerdict(next: "win" | "reject"): Promise<void> {
		const nextVerdict = verdict === next ? "undecided" : next;
		try {
			await setVerdict({ trialId: trial._id, verdict: nextVerdict });
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to set verdict",
			);
		}
	}

	async function handlePromote(): Promise<void> {
		setIsPromoting(true);
		try {
			await promoteTrial({ trialId: trial._id });
			toast.success("Promoted to live");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to promote trial",
			);
		} finally {
			setIsPromoting(false);
		}
	}

	return (
		<div
			className={cn(
				"space-y-3 rounded-lg border p-3",
				verdict === "win" && "border-emerald-500/30 bg-emerald-500/5",
				verdict === "reject" && "opacity-60",
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<Badge variant="outline" className="font-mono text-xs">
						{trial.variantId}
					</Badge>
					{trial.model ? (
						<span className="text-muted-foreground text-xs">{trial.model}</span>
					) : null}
				</div>
				{isPromoted ? <Badge variant="secondary">Promoted</Badge> : null}
			</div>

			<TrialPayloadPreview slice={trial.slice} payload={trial.payload} />

			{trial.autoEval ? <AutoEvalChips autoEval={trial.autoEval} /> : null}

			{!isPromoted ? (
				<div className="flex items-center gap-2 pt-1">
					<Button
						type="button"
						size="sm"
						variant={verdict === "win" ? "default" : "outline"}
						onClick={() => handleVerdict("win")}
					>
						<Check className="h-3.5 w-3.5" />
						Win
					</Button>
					<Button
						type="button"
						size="sm"
						variant={verdict === "reject" ? "destructive" : "outline"}
						onClick={() => handleVerdict("reject")}
					>
						<X className="h-3.5 w-3.5" />
						Reject
					</Button>
					<Button
						type="button"
						size="sm"
						variant="secondary"
						className="ml-auto"
						disabled={isPromoting}
						onClick={handlePromote}
					>
						{isPromoting ? "Promoting…" : "Promote to live"}
					</Button>
				</div>
			) : null}
		</div>
	);
}

function TrialPayloadPreview({
	slice,
	payload,
}: {
	slice: EnrichmentSliceKey;
	payload: Trial["payload"];
}) {
	if (slice === "whyListen") {
		const p = payload as { whyListenPitch: string };
		return <p className="text-sm leading-relaxed">{p.whyListenPitch}</p>;
	}

	if (slice === "artistContext") {
		const p = payload as {
			origin?: string;
			activeSince?: string;
			instagramUrl?: string;
			artistWriteup?: string;
			listenIfYouLike?: string[];
		};
		return (
			<div className="space-y-1.5 text-sm">
				{p.artistWriteup ? (
					<p className="leading-relaxed">{p.artistWriteup}</p>
				) : null}
				<div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
					{p.origin ? <span>Origin: {p.origin}</span> : null}
					{p.activeSince ? <span>Active since: {p.activeSince}</span> : null}
					{p.instagramUrl ? <span>IG: {p.instagramUrl}</span> : null}
				</div>
				{p.listenIfYouLike && p.listenIfYouLike.length > 0 ? (
					<div className="flex flex-wrap gap-1">
						{p.listenIfYouLike.map((artist) => (
							<Badge key={artist} variant="outline" className="text-xs">
								{artist}
							</Badge>
						))}
					</div>
				) : null}
			</div>
		);
	}

	const p = payload as { tags: Array<{ label: string }> };
	return (
		<div className="flex flex-wrap gap-1.5">
			{p.tags.map((tag) => (
				<Badge key={tag.label} variant="secondary">
					{tag.label}
				</Badge>
			))}
		</div>
	);
}

function AutoEvalChips({ autoEval }: { autoEval: AutoEval }) {
	return (
		<div className="space-y-1">
			<div className="flex flex-wrap gap-1.5">
				<Badge
					variant="outline"
					className={
						autoEval.passed
							? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
							: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
					}
				>
					{autoEval.passed ? "Auto-check passed" : "Auto-check failed"}
				</Badge>
				{autoEval.checks.map((check) => (
					<Badge
						key={check.id}
						variant="outline"
						title={check.note}
						className={
							check.passed
								? "text-emerald-700 dark:text-emerald-300"
								: "text-red-700 dark:text-red-300"
						}
					>
						{check.passed ? (
							<Check className="h-3 w-3" />
						) : (
							<X className="h-3 w-3" />
						)}
						{check.id}
					</Badge>
				))}
			</div>
			{autoEval.notes ? (
				<p className="text-muted-foreground text-xs">{autoEval.notes}</p>
			) : null}
		</div>
	);
}
