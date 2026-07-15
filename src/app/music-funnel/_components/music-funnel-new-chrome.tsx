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
	accent = "rail",
}: {
	isNew: boolean;
	className?: string;
	children: ReactNode;
	accent?: "rail" | "none";
}): ReactNode {
	return (
		<div
			className={cn(
				"py-3",
				accent === "rail" && "border-l-2 pl-3",
				accent === "rail" &&
					(isNew
						? "border-amber-500 bg-amber-500/10"
						: "border-transparent"),
				accent === "none" && isNew && "bg-amber-500/10",
				className,
			)}
		>
			{children}
		</div>
	);
}
