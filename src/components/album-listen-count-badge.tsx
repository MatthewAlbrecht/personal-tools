import type { ReactNode } from "react";

export function getListenCountBadgeState({
	listenCount,
	isFirstListen = false,
}: {
	listenCount: number;
	isFirstListen?: boolean;
}): { showFirst: boolean; showCount: boolean } {
	return {
		showFirst: isFirstListen,
		showCount: listenCount >= 1,
	};
}

export function AlbumListenCountBadge({
	listenCount,
	isFirstListen = false,
}: {
	listenCount: number;
	isFirstListen?: boolean;
}): ReactNode {
	const { showFirst, showCount } = getListenCountBadgeState({
		listenCount,
		isFirstListen,
	});

	if (!showFirst && !showCount) {
		return null;
	}

	return (
		<span className="inline-flex items-center gap-1">
			{showFirst ? (
				<span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-[10px] text-emerald-600 dark:text-emerald-400">
					First
				</span>
			) : null}
			{showCount ? (
				<span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground">
					{listenCount}×
				</span>
			) : null}
		</span>
	);
}
