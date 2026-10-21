"use client";

import { useMutation, useQuery } from "convex/react";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import type * as React from "react";
import { Button } from "~/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "~/components/ui/empty";
import { Skeleton } from "~/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

const TABS = [
	{ value: "cards", label: "Cards", path: "" },
	{ value: "listings", label: "Listings", path: "/listings" },
	{ value: "searches", label: "Searches", path: "/searches" },
] as const;

/**
 * The part of every Deck route that stays still between tabs: the back link,
 * the Deck name and the Cards · Listings · Searches tabs.
 */
export function DeckShell({
	deckId,
	children,
}: {
	deckId: Id<"yugiohDecks">;
	children: React.ReactNode;
}): React.ReactElement {
	const deck = useQuery(api.yugioh.decks.getDeck, { deckId });
	const pathname = usePathname() ?? "";
	useDeckVisit(deckId);
	const base = `/yugioh/decks/${deckId}`;

	if (deck === null) return <MissingDeck />;

	const active =
		TABS.find((tab) => tab.path !== "" && pathname.startsWith(base + tab.path))
			?.value ?? "cards";

	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
			<div className="flex flex-col gap-3">
				<div className="flex flex-col gap-1">
					<Link
						href="/yugioh"
						className="-ml-1 flex w-fit items-center gap-0.5 rounded-sm text-muted-foreground text-sm outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
					>
						<ChevronLeft className="size-4" aria-hidden />
						Decks
					</Link>
					{deck === undefined ? (
						<Skeleton className="h-9 w-56" />
					) : (
						<h1 className="font-display font-semibold text-2xl md:text-3xl">
							{deck.name}
						</h1>
					)}
				</div>
				<nav
					aria-label="Deck"
					className="-mx-4 md:-mx-6 sticky top-14 z-10 border-b bg-background/95 px-4 backdrop-blur md:px-6"
				>
					<Tabs value={active}>
						<TabsList variant="line" className="h-11">
							{TABS.map((tab) => (
								<TabsTrigger
									key={tab.value}
									value={tab.value}
									className="flex-none px-3"
									asChild
								>
									<Link href={base + tab.path}>{tab.label}</Link>
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>
				</nav>
			</div>
			{children}
		</div>
	);
}

/** How often a visit is recorded while the Deck stays open and in view. */
const VISIT_HEARTBEAT_MS = 5 * 60 * 1000;

/**
 * Records a visit to the Deck when it opens, every few minutes while it stays
 * in view, and whenever the page comes back into view (the installed app
 * resumes without reloading). So the next visit's "new" starts about when I
 * stopped looking.
 */
function useDeckVisit(deckId: Id<"yugiohDecks">): void {
	const recordDeckVisit = useMutation(api.yugioh.decks.recordDeckVisit);
	// Syncs with the browser's page visibility and a timer.
	useEffect(() => {
		function record(): void {
			if (document.visibilityState !== "visible") return;
			// A missed visit only leaves "new" a little stale; nothing to tell me.
			recordDeckVisit({ deckId }).catch(() => {});
		}
		record();
		const heartbeat = window.setInterval(record, VISIT_HEARTBEAT_MS);
		document.addEventListener("visibilitychange", record);
		return () => {
			window.clearInterval(heartbeat);
			document.removeEventListener("visibilitychange", record);
		};
	}, [deckId, recordDeckVisit]);
}

function MissingDeck(): React.ReactElement {
	return (
		<Empty className="mx-auto w-full max-w-5xl border">
			<EmptyHeader>
				<EmptyTitle>This Deck doesn't exist.</EmptyTitle>
				<EmptyDescription>It may have been removed.</EmptyDescription>
			</EmptyHeader>
			<EmptyContent>
				<Button variant="outline" asChild>
					<Link href="/yugioh">Decks</Link>
				</Button>
			</EmptyContent>
		</Empty>
	);
}
