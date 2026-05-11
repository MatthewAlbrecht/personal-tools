import { PublicPlaylistLyricsReader } from "../../../playlist-lyrics/_components/playlist-lyrics-reader";

export default async function PublicPlaylistLyricsPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;

	return <PublicPlaylistLyricsReader slug={slug} />;
}
