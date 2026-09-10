"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Separator } from "~/components/ui/separator";
import {
	APP_NAV_GROUPS,
	type AppNavGroup,
	type AppNavItem,
	isNavItemActive,
} from "~/lib/navigation/app-nav";
import { cn } from "~/lib/utils";

export function AppSidebar() {
	const pathname = usePathname() ?? "";
	const homeActive = pathname === "/";

	return (
		<nav aria-label="Primary" className="flex h-full flex-col gap-4 px-3 py-4">
			<Link
				href="/"
				className={cn(
					"rounded-md px-2.5 py-2 text-sm transition-colors",
					homeActive
						? "bg-teal-900 font-medium text-[#f4f7f6]"
						: "font-medium text-stone-800 hover:bg-stone-900/5 hover:text-stone-950",
				)}
			>
				Home
			</Link>

			<Separator className="bg-stone-900/10" />

			{APP_NAV_GROUPS.map((group) => (
				<NavGroup key={group.id} group={group} />
			))}
		</nav>
	);
}

function NavGroup({ group }: { group: AppNavGroup }) {
	const [open, setOpen] = useState(!group.defaultCollapsed);
	const isAlbums = group.id === "my-albums";

	return (
		<div className="space-y-1">
			{group.defaultCollapsed ? (
				<button
					type="button"
					onClick={() => setOpen((value) => !value)}
					className="flex w-full items-center justify-between px-2.5 py-1 font-semibold text-[0.62rem] text-stone-500 uppercase tracking-[0.16em]"
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
				<p className="px-2.5 py-1 font-semibold text-[0.62rem] text-stone-500 uppercase tracking-[0.16em]">
					{group.label}
				</p>
			)}
			{open ? (
				<ul className={cn("space-y-0.5", isAlbums && "pb-1")}>
					{group.items.map((item) => (
						<li key={item.id}>
							<NavLink item={item} emphasized={isAlbums} />
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}

function NavLink({
	item,
	emphasized = false,
}: {
	item: AppNavItem;
	emphasized?: boolean;
}) {
	const pathname = usePathname() ?? "";
	const active = isNavItemActive(pathname, item);

	return (
		<Link
			href={item.href}
			className={cn(
				"block rounded-md px-2.5 py-1.5 text-sm transition-colors",
				emphasized && "py-2",
				active
					? "bg-teal-900 font-medium text-[#f4f7f6]"
					: "text-stone-700 hover:bg-stone-900/5 hover:text-stone-950",
			)}
		>
			{item.label}
		</Link>
	);
}
