import type React from "react";
import { PrivatePlaylistLyricsZine } from "../../_components/playlist-lyrics-zine";

export default async function PlaylistLyricsZinePage({
	params,
}: {
	params: Promise<{ slug: string }>;
}): Promise<React.JSX.Element> {
	const { slug } = await params;

	return <PrivatePlaylistLyricsZine slug={slug} />;
}
