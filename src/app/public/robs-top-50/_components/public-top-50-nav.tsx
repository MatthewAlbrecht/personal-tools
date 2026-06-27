"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "~/lib/utils";

export function PublicTop50Nav() {
	const pathname = usePathname();
	const isStatsPage =
		pathname?.startsWith("/public/robs-top-50/stats") ?? false;

	return (
		<nav className="mb-6 flex flex-wrap gap-2">
			<Link
				href="/public/robs-top-50"
				className={cn(
					"rounded-full border px-3 py-1 text-sm transition-colors",
					!isStatsPage
						? "border-primary bg-primary text-primary-foreground"
						: "hover:bg-muted",
				)}
			>
				Lists
			</Link>
			<Link
				href="/public/robs-top-50/stats"
				className={cn(
					"rounded-full border px-3 py-1 text-sm transition-colors",
					isStatsPage
						? "border-primary bg-primary text-primary-foreground"
						: "hover:bg-muted",
				)}
			>
				Artist stats
			</Link>
		</nav>
	);
}
