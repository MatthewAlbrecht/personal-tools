"use client";

import type * as React from "react";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "~/components/ui/drawer";
import { useMediaQuery } from "~/lib/hooks/use-media-query";

/**
 * The /yugioh drawer: a bottom sheet on mobile, a right panel at `md:` and up.
 * Use it for every form or details view in /yugioh (AGENTS.md: Drawer over Dialog).
 */
export function YugiohDrawer({
	open,
	onOpenChange,
	title,
	description,
	header,
	footer,
	children,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description?: string;
	/** Replaces the default title block; must still render a `DrawerTitle`. */
	header?: React.ReactNode;
	footer?: React.ReactNode;
	children: React.ReactNode;
}): React.ReactElement {
	const isDesktop = useMediaQuery("(min-width: 768px)");
	return (
		<Drawer
			open={open}
			onOpenChange={onOpenChange}
			direction={isDesktop ? "right" : "bottom"}
		>
			<DrawerContent className="data-[vaul-drawer-direction=bottom]:h-[90dvh] data-[vaul-drawer-direction=bottom]:max-h-[90dvh] data-[vaul-drawer-direction=right]:w-full data-[vaul-drawer-direction=right]:sm:max-w-md">
				{header ?? (
					<DrawerHeader className="text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
						<DrawerTitle className="font-display text-xl">{title}</DrawerTitle>
						{description ? (
							<DrawerDescription>{description}</DrawerDescription>
						) : null}
					</DrawerHeader>
				)}
				<div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
					{children}
				</div>
				{footer ? (
					<DrawerFooter className="border-t pb-[max(1rem,env(safe-area-inset-bottom))]">
						{footer}
					</DrawerFooter>
				) : null}
			</DrawerContent>
		</Drawer>
	);
}
