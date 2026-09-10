"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
	APP_NAV_GROUPS,
	type AppNavGroup,
	type AppNavItem,
	isNavItemActive,
} from "~/lib/navigation/app-nav";
import { cn } from "~/lib/utils";

export function AppSidebar() {
	return (
		<nav aria-label="Primary" className="flex h-full flex-col gap-6 px-3 py-5">
			<Link
				href="/"
				className="px-2 font-[family-name:var(--font-display)] text-lg text-sidebar-foreground tracking-tight"
			>
				Home
			</Link>
			{APP_NAV_GROUPS.map((group) => (
				<NavGroup key={group.id} group={group} />
			))}
		</nav>
	);
}

function NavGroup({ group }: { group: AppNavGroup }) {
	const [open, setOpen] = useState(!group.defaultCollapsed);

	return (
		<div className="space-y-1">
			{group.defaultCollapsed ? (
				<button
					type="button"
					onClick={() => setOpen((value) => !value)}
					className="flex w-full items-center justify-between px-2 py-1 font-semibold text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]"
				>
					{group.label}
					<ChevronDown
						className={cn(
							"size-3.5 transition-transform",
							open ? "rotate-0" : "-rotate-90",
						)}
					/>
				</button>
			) : (
				<p className="px-2 py-1 font-semibold text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]">
					{group.label}
				</p>
			)}
			{open ? (
				<ul className="space-y-0.5">
					{group.items.map((item) => (
						<li key={item.id}>
							<NavLink item={item} />
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}

function NavLink({ item }: { item: AppNavItem }) {
	const pathname = usePathname() ?? "";
	const active = isNavItemActive(pathname, item);

	return (
		<Link
			href={item.href}
			className={cn(
				"block rounded-md px-2 py-1.5 text-sm transition-colors",
				active
					? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
					: "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
			)}
		>
			{item.label}
		</Link>
	);
}
