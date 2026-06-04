import type React from "react";
import { PublicPlaylistLyricsZine } from "../../../../playlist-lyrics/_components/playlist-lyrics-zine";

export default async function PublicPlaylistLyricsZinePage({
	params,
}: {
	params: Promise<{ slug: string }>;
}): Promise<React.JSX.Element> {
	const { slug } = await params;

	return <PublicPlaylistLyricsZine slug={slug} />;
}
