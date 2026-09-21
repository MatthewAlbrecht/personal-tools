"use client";

import type { ReactNode } from "react";
import { Checkbox } from "~/components/ui/checkbox";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "~/components/ui/drawer";
import { Label } from "~/components/ui/label";

export type ZineCreditRow = {
	label: string;
	contributors: Array<{ name: string }>;
};

export function ZineCreditsDrawer({
	open,
	onOpenChange,
	trackLabel,
	credits,
	hiddenCreditLabels,
	onVisibilityChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	trackLabel: string;
	credits: ZineCreditRow[];
	hiddenCreditLabels: string[];
	onVisibilityChange: (label: string, visible: boolean) => void;
}): ReactNode {
	const hidden = new Set(hiddenCreditLabels);

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent className="mx-auto max-w-lg">
				<DrawerHeader>
					<DrawerTitle className="font-[family-name:var(--font-display)]">
						Credits
					</DrawerTitle>
					<DrawerDescription>
						{trackLabel} — choose which rows appear on the lyric page.
					</DrawerDescription>
				</DrawerHeader>
				<div className="max-h-[60vh] space-y-3 overflow-y-auto px-4 pb-8">
					{credits.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No credits for this track.
						</p>
					) : (
						credits.map((credit, index) => {
							const inputId = `zine-credit-${index}-${credit.label}`;
							const isVisible = !hidden.has(credit.label);

							return (
								<div key={credit.label} className="flex items-start gap-2">
									<Checkbox
										id={inputId}
										checked={isVisible}
										onCheckedChange={(checked) => {
											onVisibilityChange(credit.label, checked === true);
										}}
									/>
									<div className="min-w-0 space-y-0.5">
										<Label
											htmlFor={inputId}
											className="cursor-pointer font-normal text-sm"
										>
											{credit.label}
										</Label>
										<p className="text-muted-foreground text-xs">
											{credit.contributors
												.map((contributor) => contributor.name)
												.join(", ")}
										</p>
									</div>
								</div>
							);
						})
					)}
				</div>
			</DrawerContent>
		</Drawer>
	);
}
