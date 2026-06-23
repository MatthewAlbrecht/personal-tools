"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
	{ href: "/concerts/upcoming", label: "Upcoming Shows" },
	{ href: "/concerts/new", label: "New Shows" },
	{ href: "/concerts/venues", label: "Venues" },
] as const;

export function ConcertTabs() {
	const pathname = usePathname();

	return (
		<div className="flex gap-1 rounded-lg bg-muted p-1">
			{TABS.map((tab) => {
				const isActive = pathname === tab.href;

				return (
					<Link
						className={`flex-1 rounded-md px-4 py-2 text-center font-medium text-sm transition-colors ${
							isActive
								? "bg-background text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground"
						}`}
						href={tab.href}
						key={tab.href}
					>
						{tab.label}
					</Link>
				);
			})}
		</div>
	);
}
