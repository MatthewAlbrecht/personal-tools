import type { FunctionReturnType } from "convex/server";
import { Clock3, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Badge } from "~/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import type { api } from "../../../../convex/_generated/api";
import { getSliceLabel } from "../_utils/presentation";

type RecentEnrichmentRows = FunctionReturnType<
	typeof api.albumEnrichment.listRecentEnrichments
>;
type RecentEnrichmentRow = RecentEnrichmentRows[number];

export function RecentEnrichments({
	rows,
}: {
	rows: RecentEnrichmentRows | undefined;
}) {
	return (
		<Card className="h-fit gap-0 py-0">
			<CardHeader className="border-b py-4">
				<CardTitle>Recent enrichments</CardTitle>
				<CardDescription>Latest saved research slices</CardDescription>
			</CardHeader>
			<CardContent className="p-0">
				{rows === undefined ? (
					<RecentSkeleton />
				) : rows.length === 0 ? (
					<EmptyRecent />
				) : (
					<div className="divide-y">
						{rows.map((row) => (
							<RecentRow key={row.albumId} row={row} />
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function RecentRow({ row }: { row: RecentEnrichmentRow }) {
	return (
		<div className="p-4">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<Link
						href={`/albums/details/${row.albumId}`}
						className="font-medium text-sm leading-tight hover:underline"
					>
						{row.title}
					</Link>
					<p className="mt-1 truncate text-muted-foreground text-xs">
						{row.artists.join(", ")}
						{row.releaseYear ? ` · ${row.releaseYear}` : ""}
					</p>
				</div>
				<Link
					href={`/albums/details/${row.albumId}`}
					aria-label={`Open ${row.title} dossier`}
					className="text-muted-foreground hover:text-foreground"
				>
					<ExternalLink className="size-3.5" />
				</Link>
			</div>
			<div className="mt-2.5 flex flex-wrap gap-1">
				{row.presentSlices.map((slice) => (
					<Badge
						key={slice}
						variant="secondary"
						className="px-2 font-normal text-[10px]"
					>
						{getSliceLabel(slice)}
					</Badge>
				))}
			</div>
			<p className="mt-2.5 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
				<Clock3 className="size-3" />
				<time dateTime={new Date(row.lastEnrichedAt).toISOString()}>
					{formatEnrichedAt(row.lastEnrichedAt)}
				</time>
			</p>
		</div>
	);
}

function EmptyRecent() {
	return (
		<div className="flex min-h-48 items-center justify-center p-6 text-center">
			<div>
				<Clock3 className="mx-auto size-6 text-muted-foreground/60" />
				<p className="mt-3 font-medium text-sm">No recent enrichments</p>
				<p className="mt-1 text-muted-foreground text-xs">
					Saved research activity will appear here.
				</p>
			</div>
		</div>
	);
}

function RecentSkeleton() {
	return (
		<div className="divide-y" aria-busy="true">
			<output className="sr-only" aria-live="polite">
				Loading recent album enrichments
			</output>
			{Array.from({ length: 5 }, (_, index) => (
				<div key={index} className="space-y-2.5 p-4">
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-3 w-1/2" />
					<Skeleton className="h-5 w-3/4" />
				</div>
			))}
		</div>
	);
}

function formatEnrichedAt(timestamp: number): string {
	return new Intl.DateTimeFormat("en-US", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(timestamp);
}
