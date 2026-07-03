"use client";

import { Skeleton } from "~/components/ui/skeleton";

export type TopLevelGenreCountRow = {
	genreKey: string;
	label: string;
	count: number;
	albums: Array<{
		position: number;
		albumName: string;
		artistName: string;
	}>;
};

export function TopLevelGenreCountsTable({
	rows,
}: {
	rows: TopLevelGenreCountRow[];
}) {
	if (rows.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				No genre data available for this year yet.
			</p>
		);
	}

	return (
		<ol className="space-y-1">
			{rows.map((row, index) => (
				<li
					key={row.genreKey}
					className="rounded-md px-2 py-2 hover:bg-muted/40"
				>
					<div className="flex items-center gap-3">
						<span className="w-8 flex-shrink-0 text-right font-mono text-muted-foreground text-sm">
							{index + 1}
						</span>
						<div className="min-w-0 flex-1">
							<p className="truncate font-medium text-sm">{row.label}</p>
						</div>
						<span className="flex-shrink-0 font-mono text-sm tabular-nums">
							{row.count}
						</span>
					</div>
					{row.albums.length > 0 ? (
						<ol className="mt-2 ml-11 space-y-1">
							{row.albums.map((album) => (
								<li
									key={`${row.genreKey}-${album.position}-${album.albumName}`}
									className="flex min-w-0 items-baseline gap-2 text-sm"
								>
									<span className="flex-shrink-0 font-mono text-muted-foreground text-xs">
										#{album.position}
									</span>
									<span className="min-w-0 truncate text-muted-foreground">
										<span className="text-foreground">{album.albumName}</span>{" "}
										<span>by {album.artistName}</span>
									</span>
								</li>
							))}
						</ol>
					) : null}
				</li>
			))}
		</ol>
	);
}

export function TopLevelGenreCountsTableSkeleton() {
	return (
		<div className="space-y-2">
			{["sk-1", "sk-2", "sk-3", "sk-4", "sk-5"].map((key) => (
				<div key={key} className="flex items-center gap-3 px-2 py-2">
					<Skeleton className="h-4 w-8" />
					<Skeleton className="h-4 flex-1" />
					<Skeleton className="h-4 w-6" />
				</div>
			))}
		</div>
	);
}
