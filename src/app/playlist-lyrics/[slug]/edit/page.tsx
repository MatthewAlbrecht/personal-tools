import { PlaylistLyricsEditor } from "../../_components/playlist-lyrics-editor";

export default async function EditPlaylistLyricsPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;

	return <PlaylistLyricsEditor slug={slug} />;
}
