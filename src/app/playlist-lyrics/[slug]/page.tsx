import type React from "react";
import { PlaylistLyricsReader } from "../_components/playlist-lyrics-reader";

export default async function PlaylistLyricsPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}): Promise<React.JSX.Element> {
	const { slug } = await params;

	return <PlaylistLyricsReader slug={slug} />;
}
