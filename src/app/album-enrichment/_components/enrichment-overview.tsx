import type { FunctionReturnType } from "convex/server";
import {
	ArrowUpRight,
	BookOpenText,
	CircleDot,
	RadioTower,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import type { api } from "../../../../convex/_generated/api";
import {
	buildMissingSliceEntries,
	formatScanDisclosure,
	getSliceLabel,
} from "../_utils/presentation";

type QueueStatus = FunctionReturnType<
	typeof api.albumEnrichment.getQueueStatus
>;

export function EnrichmentOverview({
	status,
}: {
	status: QueueStatus | undefined;
}) {
	return (
		<div className="space-y-4">
			<header className="overflow-hidden rounded-xl border bg-card">
				<div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-end">
					<div className="max-w-2xl space-y-3">
						<div className="flex items-center gap-2 font-medium text-muted-foreground text-xs uppercase tracking-[0.18em]">
							<RadioTower className="size-3.5 text-emerald-500" />
							Research operations
						</div>
						<div>
							<h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
								Album enrichment
							</h1>
							<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
								A read-only view of research coverage across the active For
								Later queue.
							</p>
						</div>
						<div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
							<QuickLink href="/for-later-albums" label="For Later" />
							<QuickLink href="/albums/all" label="Album library" />
							<a
								href="https://github.com/MatthewAlbrecht/personal-tools/blob/main/docs/album-research-enrichment.md"
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground hover:underline"
							>
								<BookOpenText className="size-3.5" />
								Research guide
								<ArrowUpRight className="size-3.5" />
							</a>
						</div>
					</div>
					<div className="rounded-lg border bg-muted/35 px-4 py-3 text-sm lg:max-w-72">
						<p className="font-medium">Operator handoff</p>
						<p className="mt-1 text-muted-foreground leading-relaxed">
							Run{" "}
							<code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs">
								/enrich-for-later-album
							</code>{" "}
							from an approved agent session to process the next record.
						</p>
					</div>
				</div>
			</header>

			{status === undefined ? (
				<OverviewSkeleton />
			) : (
				<>
					<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
						<MetricCard
							label="Incomplete"
							value={status.incomplete}
							tone="warm"
						/>
						<MetricCard label="Complete" value={status.complete} tone="cool" />
						<MetricCard
							label="Not started"
							value={status.neverStarted}
							tone="neutral"
						/>
						<MetricCard label="Partial" value={status.partial} tone="neutral" />
					</div>

					<Card className="gap-0 py-0">
						<CardContent className="grid gap-5 p-5 md:grid-cols-[1fr_1.25fr]">
							<div>
								<div className="flex items-center justify-between gap-4">
									<div>
										<h2 className="font-medium">Missing slices</h2>
										<p className="mt-1 text-muted-foreground text-xs">
											{formatScanDisclosure(status)}
										</p>
									</div>
									<span className="font-mono text-muted-foreground text-xs">
										{status.activeVisible.toLocaleString()} visible
									</span>
								</div>
								<div className="mt-4 grid grid-cols-2 gap-2">
									{buildMissingSliceEntries(status.missing).map((entry) => (
										<div
											key={entry.key}
											className="rounded-md border bg-muted/25 px-3 py-2.5"
										>
											<p className="font-mono text-lg tabular-nums">
												{entry.count.toLocaleString()}
											</p>
											<p className="text-muted-foreground text-xs">
												{entry.label}
											</p>
										</div>
									))}
								</div>
							</div>
							<NextClaimable album={status.nextClaimable} />
						</CardContent>
					</Card>
				</>
			)}
		</div>
	);
}

function QuickLink({ href, label }: { href: string; label: string }) {
	return (
		<Link
			href={href}
			className="inline-flex items-center gap-1 font-medium hover:underline"
		>
			{label}
			<ArrowUpRight className="size-3.5" />
		</Link>
	);
}

function MetricCard({
	label,
	value,
	tone,
}: {
	label: string;
	value: number;
	tone: "warm" | "cool" | "neutral";
}) {
	const indicatorClass =
		tone === "warm"
			? "bg-amber-500"
			: tone === "cool"
				? "bg-emerald-500"
				: "bg-muted-foreground/45";

	return (
		<Card className="gap-3 py-4 shadow-none">
			<CardContent className="px-4">
				<div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
					<span className={`size-1.5 rounded-full ${indicatorClass}`} />
					{label}
				</div>
				<p className="mt-2 font-mono text-3xl tabular-nums">
					{value.toLocaleString()}
				</p>
			</CardContent>
		</Card>
	);
}

function NextClaimable({
	album,
}: {
	album: QueueStatus["nextClaimable"];
}) {
	if (!album) {
		return (
			<div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed bg-muted/20 p-5 text-center">
				<div>
					<CircleDot className="mx-auto size-5 text-emerald-500" />
					<p className="mt-2 font-medium text-sm">Queue caught up</p>
					<p className="mt-1 text-muted-foreground text-xs">
						No claimable album was found in this scan.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="rounded-lg border bg-muted/20 p-4">
			<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
				Next claimable
			</p>
			<div className="mt-3 flex items-start justify-between gap-4">
				<div className="min-w-0">
					<Link
						href={`/albums/details/${album.albumId}`}
						className="font-medium hover:underline"
					>
						{album.title}
					</Link>
					<p className="mt-1 truncate text-muted-foreground text-sm">
						{album.artists.join(", ")}
						{album.releaseYear ? ` · ${album.releaseYear}` : ""}
					</p>
				</div>
				<Badge variant="outline" className="shrink-0 font-mono">
					{album.missingSlices.length}/4 missing
				</Badge>
			</div>
			<div className="mt-4 flex flex-wrap gap-1.5">
				{album.missingSlices.map((slice) => (
					<Badge key={slice} variant="secondary" className="font-normal">
						{getSliceLabel(slice)}
					</Badge>
				))}
			</div>
		</div>
	);
}

function OverviewSkeleton() {
	return (
		<div className="space-y-3" aria-busy="true">
			<output className="sr-only" aria-live="polite">
				Loading enrichment queue summary
			</output>
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				{Array.from({ length: 4 }, (_, index) => (
					<Skeleton key={index} className="h-24 rounded-xl" />
				))}
			</div>
			<Skeleton className="h-56 rounded-xl" />
		</div>
	);
}
