"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
	{ href: "/lyrics", label: "Albums" },
	{ href: "/lyrics/playlists", label: "Playlists" },
] as const;

export function LyricsTabs() {
	const pathname = usePathname();

	return (
		<div className="mb-6 flex gap-1 rounded-lg bg-muted p-1">
			{TABS.map((tab) => {
				const isActive = pathname === tab.href;

				return (
					<Link
						key={tab.href}
						href={tab.href}
						className={`flex-1 rounded-md px-4 py-2 text-center font-medium text-sm transition-colors ${
							isActive
								? "bg-background text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						{tab.label}
					</Link>
				);
			})}
		</div>
	);
}
