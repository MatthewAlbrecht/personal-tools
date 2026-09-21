"use client";

import { List } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "~/components/ui/sheet";
import { cn } from "~/lib/utils";
import type { ZineEditorPersistStatus } from "./use-zine-editor-persist";

export type ZineEditorNavItem = {
	id: string;
	label: string;
	children?: Array<{ id: string; label: string }>;
};

export function ZineEditorShell({
	eyebrow,
	title,
	persistStatus,
	persistError,
	zineHref,
	backHref,
	backLabel = "Back",
	navItems,
	headerActions,
	stickyTrackLabel,
	showStickyTrack,
	children,
}: {
	eyebrow: string;
	title: string;
	persistStatus: ZineEditorPersistStatus;
	persistError?: string | null;
	zineHref: string;
	backHref: string;
	backLabel?: string;
	navItems: ZineEditorNavItem[];
	headerActions?: ReactNode;
	stickyTrackLabel?: string;
	showStickyTrack?: boolean;
	children: ReactNode;
}): ReactNode {
	const [contentsOpen, setContentsOpen] = useState(false);
	const [activeId, setActiveId] = useState(navItems[0]?.id ?? "");

	useEffect(() => {
		const ids = flattenNavIds(navItems);
		if (ids.length === 0) return;

		const elements = ids
			.map((id) => document.getElementById(id))
			.filter((el): el is HTMLElement => el !== null);

		if (elements.length === 0) return;

		const observer = new IntersectionObserver(
			(entries) => {
				const visible = entries
					.filter((entry) => entry.isIntersecting)
					.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
				const top = visible[0];
				if (top?.target.id) {
					setActiveId(top.target.id);
				}
			},
			{
				rootMargin: "-20% 0px -55% 0px",
				threshold: [0, 0.25, 0.5],
			},
		);

		for (const element of elements) {
			observer.observe(element);
		}

		return () => observer.disconnect();
	}, [navItems]);

	function handleNavClick(id: string): void {
		const element = document.getElementById(id);
		if (element) {
			element.scrollIntoView({ behavior: "smooth", block: "start" });
			setActiveId(id);
		}
		setContentsOpen(false);
	}

	return (
		<main className="mx-auto max-w-6xl px-4 py-8 [--zine-editor-sticky-inset:0.5rem]">
			<div className="-mx-4 sticky top-14 z-30 space-y-0 border-border/40 border-b bg-background/95 px-4 py-3 backdrop-blur-sm">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="min-w-0">
						<p className="font-semibold text-[0.65rem] text-teal-800 uppercase tracking-[0.16em]">
							{eyebrow}
						</p>
						<h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
							Edit zine
						</h1>
						<p className="mt-0.5 truncate text-muted-foreground text-sm">
							{title}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<PersistStatusBadge
							status={persistStatus}
							errorMessage={persistError}
						/>
						{headerActions}
						<Button asChild variant="outline" size="sm">
							<Link href={zineHref}>Open zine</Link>
						</Button>
						<Button asChild variant="ghost" size="sm">
							<Link href={backHref}>{backLabel}</Link>
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="xl:hidden"
							onClick={() => setContentsOpen(true)}
						>
							<List className="mr-1.5 h-4 w-4" />
							Contents
						</Button>
					</div>
				</div>
				{showStickyTrack && stickyTrackLabel ? (
					<p className="truncate font-medium text-[0.7rem] text-teal-800 tracking-[0.02em]">
						{stickyTrackLabel}
					</p>
				) : null}
			</div>

			<div className="mt-8 grid gap-10 xl:grid-cols-[minmax(0,1fr)_12rem]">
				<div className="min-w-0 space-y-14">{children}</div>
				<aside className="hidden xl:block">
					<div className="sticky top-[calc(3.5rem+5.5rem)] max-h-[calc(100vh-3.5rem-6rem)] overflow-y-auto overscroll-contain border-border/40 border-l py-1 pl-5">
						<p className="mb-3 font-semibold text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]">
							Contents
						</p>
						<ContentsNav
							items={navItems}
							activeId={activeId}
							onNavigate={handleNavClick}
						/>
					</div>
				</aside>
			</div>

			<Sheet open={contentsOpen} onOpenChange={setContentsOpen}>
				<SheetContent side="right" className="w-[17rem] sm:max-w-[17rem]">
					<SheetHeader>
						<SheetTitle className="font-[family-name:var(--font-display)] text-lg">
							Contents
						</SheetTitle>
						<SheetDescription className="sr-only">
							Jump to a section of the zine editor.
						</SheetDescription>
					</SheetHeader>
					<div className="mt-4 px-1">
						<ContentsNav
							items={navItems}
							activeId={activeId}
							onNavigate={handleNavClick}
						/>
					</div>
				</SheetContent>
			</Sheet>
		</main>
	);
}

function ContentsNav({
	items,
	activeId,
	onNavigate,
}: {
	items: ZineEditorNavItem[];
	activeId: string;
	onNavigate: (id: string) => void;
}): ReactNode {
	return (
		<nav className="space-y-1">
			{items.map((item) => {
				const isActive =
					activeId === item.id ||
					item.children?.some((child) => child.id === activeId);

				return (
					<div key={item.id} className="space-y-0.5">
						<button
							type="button"
							onClick={() => onNavigate(item.id)}
							className={cn(
								"block w-full truncate text-left text-sm transition-colors",
								isActive
									? "font-medium text-teal-800"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{item.label}
						</button>
						{item.children && item.children.length > 0 ? (
							<div className="space-y-0.5 border-border/30 border-l pl-2.5">
								{item.children.map((child) => (
									<button
										key={child.id}
										type="button"
										onClick={() => onNavigate(child.id)}
										className={cn(
											"block w-full truncate text-left text-xs transition-colors",
											activeId === child.id
												? "font-medium text-teal-800"
												: "text-muted-foreground/80 hover:text-foreground",
										)}
									>
										{child.label}
									</button>
								))}
							</div>
						) : null}
					</div>
				);
			})}
		</nav>
	);
}

function PersistStatusBadge({
	status,
	errorMessage,
}: {
	status: ZineEditorPersistStatus;
	errorMessage?: string | null;
}): ReactNode {
	if (status === "idle") {
		return (
			<span className="text-muted-foreground text-xs tabular-nums">Saved</span>
		);
	}
	if (status === "dirty") {
		return (
			<span className="text-muted-foreground text-xs tabular-nums">
				Unsaved…
			</span>
		);
	}
	if (status === "saving") {
		return (
			<span className="text-muted-foreground text-xs tabular-nums">
				Saving…
			</span>
		);
	}
	if (status === "saved") {
		return <span className="text-teal-800 text-xs tabular-nums">Saved</span>;
	}
	return (
		<span
			className="max-w-[10rem] truncate text-destructive text-xs"
			title={errorMessage ?? "Couldn't save"}
		>
			Couldn't save
		</span>
	);
}

function flattenNavIds(items: ZineEditorNavItem[]): string[] {
	const ids: string[] = [];
	for (const item of items) {
		ids.push(item.id);
		if (item.children) {
			for (const child of item.children) {
				ids.push(child.id);
			}
		}
	}
	return ids;
}
