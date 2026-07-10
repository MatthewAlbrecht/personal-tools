"use client";

import { useQuery } from "convex/react";
import { Music2 } from "lucide-react";
import { useState } from "react";
import { LoginPrompt } from "~/components/login-prompt";
import { useMusicFunnelVisitCursor } from "~/lib/hooks/use-music-funnel-visit-cursor";
import { useSpotifyAuth } from "~/lib/hooks/use-spotify-auth";
import { api } from "../../../convex/_generated/api";
import { MusicFunnelConfigDrawer } from "./_components/music-funnel-config-drawer";
import { MusicFunnelHeader } from "./_components/music-funnel-header";
import { MusicFunnelMissedBanner } from "./_components/music-funnel-missed-banner";
import { MusicFunnelRepeatLists } from "./_components/music-funnel-repeat-lists";
import { MusicFunnelTimeline } from "./_components/music-funnel-timeline";

type MusicFunnelTab = "timeline" | "repeats";

export default function MusicFunnelPage() {
	const { userId, isConnected, connection, isLoading } = useSpotifyAuth();
	const [activeTab, setActiveTab] = useState<MusicFunnelTab>("timeline");
	const [configOpen, setConfigOpen] = useState(false);
	const { visitSince } = useMusicFunnelVisitCursor(userId ?? "");

	const summary = useQuery(
		api.musicFunnel.getUiSummary,
		userId ? { userId } : "skip",
	);
	const settings = useQuery(
		api.musicFunnel.getSettings,
		userId ? { userId } : "skip",
	);
	const sources = useQuery(
		api.musicFunnel.listSources,
		userId ? { userId } : "skip",
	);

	if (isLoading) {
		return <div className="container mx-auto max-w-6xl p-6">Loading...</div>;
	}

	if (!userId) {
		return (
			<LoginPrompt
				icon={Music2}
				message="Please log in to use Music Funnel"
				redirectPath="/music-funnel"
			/>
		);
	}

	if (!isConnected) {
		return (
			<LoginPrompt
				icon={Music2}
				message="Connect Spotify to build your music funnel"
				redirectPath="/music-funnel"
			/>
		);
	}

	return (
		<div className="container mx-auto max-w-6xl space-y-6 p-6">
			<MusicFunnelHeader
				userId={userId}
				spotifyDisplayName={connection?.displayName}
				summary={summary}
				activeTab={activeTab}
				onTabChange={setActiveTab}
				onOpenConfig={() => setConfigOpen(true)}
			/>
			{activeTab === "timeline" ? (
				<MusicFunnelMissedBanner userId={userId} />
			) : null}
			{activeTab === "timeline" ? (
				<MusicFunnelTimeline userId={userId} sources={sources} />
			) : (
				<MusicFunnelRepeatLists userId={userId} visitSince={visitSince} />
			)}
			<MusicFunnelConfigDrawer
				open={configOpen}
				onOpenChange={setConfigOpen}
				userId={userId}
				settings={settings}
				sources={sources}
			/>
		</div>
	);
}
