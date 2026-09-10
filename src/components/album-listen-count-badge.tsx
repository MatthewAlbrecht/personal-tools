import type { ReactNode } from "react";

export function getListenCountBadgeState({
	listenCount,
}: {
	listenCount: number;
}): { showCount: boolean } {
	return {
		showCount: listenCount >= 1,
	};
}

export function AlbumListenCountBadge({
	listenCount,
}: {
	listenCount: number;
}): ReactNode {
	const { showCount } = getListenCountBadgeState({ listenCount });

	if (!showCount) {
		return null;
	}

	return (
		<span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground tabular-nums">
			{listenCount}×
		</span>
	);
}
