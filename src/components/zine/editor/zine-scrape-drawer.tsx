"use client";

import type { ReactNode } from "react";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "~/components/ui/drawer";

export type ZineScrapeDetail = {
	label: string;
	value: string;
	href?: string;
};

export function ZineScrapeDrawer({
	open,
	onOpenChange,
	trackLabel,
	details,
	emptyMessage,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	trackLabel: string;
	details: ZineScrapeDetail[];
	emptyMessage?: string;
}): ReactNode {
	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent className="mx-auto max-w-lg">
				<DrawerHeader>
					<DrawerTitle className="font-[family-name:var(--font-display)]">
						Scrape details
					</DrawerTitle>
					<DrawerDescription>{trackLabel}</DrawerDescription>
				</DrawerHeader>
				<div className="max-h-[60vh] space-y-3 overflow-y-auto px-4 pb-8">
					{details.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							{emptyMessage ?? "No scrape data for this track."}
						</p>
					) : (
						<dl className="grid gap-3 text-sm sm:grid-cols-2">
							{details.map((detail) => (
								<div
									key={detail.label}
									className={detail.href ? "sm:col-span-2" : undefined}
								>
									<dt className="text-muted-foreground text-xs">
										{detail.label}
									</dt>
									<dd className="mt-0.5 break-all">
										{detail.href ? (
											<a
												href={detail.href}
												target="_blank"
												rel="noreferrer"
												className="text-primary underline-offset-4 hover:underline"
											>
												{detail.value}
											</a>
										) : (
											detail.value
										)}
									</dd>
								</div>
							))}
						</dl>
					)}
				</div>
			</DrawerContent>
		</Drawer>
	);
}
