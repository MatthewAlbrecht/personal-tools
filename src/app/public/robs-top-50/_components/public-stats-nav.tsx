"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "~/lib/utils";

const STATS_NAV_OPTIONS = [
	{ href: "/public/robs-top-50/stats", label: "Finish counts" },
	{
		href: "/public/robs-top-50/stats/highest-placement",
		label: "Highest placement",
	},
] as const;

export function PublicStatsNav() {
	const pathname = usePathname();

	return (
		<nav className="mb-6 flex flex-wrap gap-2">
			{STATS_NAV_OPTIONS.map((option) => {
				const isActive =
					option.href === "/public/robs-top-50/stats"
						? pathname === option.href
						: pathname?.startsWith(option.href) ?? false;

				return (
					<Link
						key={option.href}
						href={option.href}
						className={cn(
							"rounded-full border px-3 py-1 text-sm transition-colors",
							isActive
								? "border-primary bg-primary text-primary-foreground"
								: "hover:bg-muted",
						)}
					>
						{option.label}
					</Link>
				);
			})}
		</nav>
	);
}
