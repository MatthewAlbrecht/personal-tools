"use client";

import { usePathname } from "next/navigation";
import { LyricsTabs } from "./_components/lyrics-tabs";

export default function LyricsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const pathname = usePathname();
	const showTabs =
		pathname === "/lyrics" || pathname === "/lyrics/playlists";

	if (showTabs) {
		return (
			<div className="mx-auto max-w-4xl px-4 py-10">
				<LyricsTabs />
				{children}
			</div>
		);
	}

	return children;
}
