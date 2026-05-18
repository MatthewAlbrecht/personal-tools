export function AlbumListenCountBadge({
	listenCount,
}: {
	listenCount: number;
}) {
	if (listenCount <= 0) {
		return null;
	}

	if (listenCount === 1) {
		return (
			<span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-[10px] text-emerald-600 dark:text-emerald-400">
				First
			</span>
		);
	}

	return (
		<span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground">
			{listenCount}×
		</span>
	);
}
