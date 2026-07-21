import type { FunctionReturnType } from "convex/server";
import { ArrowUpRight, Disc3 } from "lucide-react";
import Image from "next/image";
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
import { formatScanDisclosure, getSliceLabel } from "../_utils/presentation";

type IncompleteQueueResult = FunctionReturnType<
	typeof api.albumEnrichment.listIncompleteQueue
>;
type IncompleteQueueRow = IncompleteQueueResult["rows"][number];

export function IncompleteQueue({
	queue,
}: {
	queue: IncompleteQueueResult | undefined;
}) {
	return (
		<Card className="gap-0 py-0">
			<CardHeader className="border-b py-4">
				<CardTitle>Incomplete queue</CardTitle>
				<CardDescription>
					{queue
						? `${queue.rows.length} shown · ${formatScanDisclosure(queue).toLowerCase()}`
						: "Loading active For Later records"}
				</CardDescription>
			</CardHeader>
			<CardContent className="p-0">
				{queue === undefined ? (
					<QueueSkeleton />
				) : queue.rows.length === 0 ? (
					<EmptyQueue />
				) : (
					<div className="divide-y">
						{queue.rows.map((row, index) => (
							<QueueRow key={row.albumId} row={row} position={index + 1} />
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function QueueRow({
	row,
	position,
}: {
	row: IncompleteQueueRow;
	position: number;
}) {
	return (
		<div className="group flex gap-3 p-3.5 sm:gap-4 sm:p-4">
			<span className="hidden w-6 pt-3 text-right font-mono text-muted-foreground/60 text-xs sm:block">
				{String(position).padStart(2, "0")}
			</span>
			<AlbumCover imageUrl={row.coverImageUrl} title={row.title} />
			<div className="min-w-0 flex-1">
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
						className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						<ArrowUpRight className="size-4" />
					</Link>
				</div>
				<div className="mt-2.5 flex flex-wrap gap-1">
					{row.missingSlices.map((slice) => (
						<Badge
							key={slice}
							variant="outline"
							className="border-amber-500/30 bg-amber-500/5 px-2 font-normal text-[10px] text-amber-700 dark:text-amber-300"
						>
							{getSliceLabel(slice)}
						</Badge>
					))}
				</div>
			</div>
		</div>
	);
}

function AlbumCover({
	imageUrl,
	title,
}: {
	imageUrl: string | undefined;
	title: string;
}) {
	if (!imageUrl) {
		return (
			<div className="flex size-14 shrink-0 items-center justify-center rounded-md border bg-muted sm:size-16">
				<Disc3 className="size-5 text-muted-foreground/60" />
			</div>
		);
	}

	return (
		<Image
			src={imageUrl}
			alt={`${title} cover`}
			width={64}
			height={64}
			className="size-14 shrink-0 rounded-md object-cover sm:size-16"
		/>
	);
}

function EmptyQueue() {
	return (
		<div className="flex min-h-56 items-center justify-center p-6 text-center">
			<div>
				<Disc3 className="mx-auto size-7 text-emerald-500" />
				<p className="mt-3 font-medium">Research queue caught up</p>
				<p className="mt-1 text-muted-foreground text-sm">
					No incomplete albums were found in the active scan.
				</p>
			</div>
		</div>
	);
}

function QueueSkeleton() {
	return (
		<div className="divide-y" aria-busy="true">
			<output className="sr-only" aria-live="polite">
				Loading incomplete enrichment queue
			</output>
			{Array.from({ length: 6 }, (_, index) => (
				<div key={index} className="flex gap-4 p-4">
					<Skeleton className="size-16 shrink-0" />
					<div className="flex-1 space-y-2">
						<Skeleton className="h-4 w-2/3" />
						<Skeleton className="h-3 w-1/3" />
						<Skeleton className="h-5 w-1/2" />
					</div>
				</div>
			))}
		</div>
	);
}
