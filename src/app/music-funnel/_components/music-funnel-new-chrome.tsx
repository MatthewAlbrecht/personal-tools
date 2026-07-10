import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

export const musicFunnelNewBannerClassName =
	"rounded-lg border border-amber-500/50 bg-amber-500/15 px-4 py-3";

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
				isNew &&
					"border-amber-500/40 border-l-4 border-l-amber-500 bg-amber-500/10",
			)}
		>
			{isNew ? (
				<span className="mb-1 inline-block font-medium text-amber-700 text-xs dark:text-amber-400">
					New
				</span>
			) : null}
			{children}
		</div>
	);
}
