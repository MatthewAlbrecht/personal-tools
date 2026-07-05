"use client";

import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "~/components/ui/drawer";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { MusicFunnelSettingsCard } from "./music-funnel-settings-card";
import { MusicFunnelSourcesCard } from "./music-funnel-sources-card";

export function MusicFunnelConfigDrawer({
	open,
	onOpenChange,
	userId,
	settings,
	sources,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	userId: string;
	settings: Doc<"musicFunnelSettings"> | null | undefined;
	sources: Doc<"musicFunnelSources">[] | undefined;
}) {
	return (
		<Drawer open={open} onOpenChange={onOpenChange} direction="right">
			<DrawerContent className="flex h-full w-full flex-col sm:max-w-lg">
				<DrawerHeader className="shrink-0 border-b pb-4 text-left">
					<DrawerTitle>Configuration</DrawerTitle>
					<DrawerDescription>
						Destination playlists and source playlist management.
					</DrawerDescription>
				</DrawerHeader>
				<div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4">
					<MusicFunnelSettingsCard userId={userId} settings={settings} />
					<MusicFunnelSourcesCard userId={userId} sources={sources} />
				</div>
			</DrawerContent>
		</Drawer>
	);
}
