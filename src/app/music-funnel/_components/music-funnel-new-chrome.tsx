import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

export const musicFunnelNewBannerClassName =
	"border-amber-500/40 border-l-2 bg-amber-500/10 px-4 py-2.5";

export function MusicFunnelNewBadge(): ReactNode {
	return (
		<span className="font-medium text-amber-700 text-xs dark:text-amber-400">
			New
		</span>
	);
}

export function MusicFunnelNewChrome({
	isNew,
	className,
	children,
}: {
	isNew: boolean;
	className?: string;
	children: ReactNode;
}): ReactNode {
	return (
		<div
			className={cn(
				className,
				isNew && "border-amber-500 border-l-2 bg-amber-500/10 pl-3",
			)}
		>
			{children}
		</div>
	);
}
