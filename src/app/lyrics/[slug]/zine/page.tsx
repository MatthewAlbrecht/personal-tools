import { PrivateAlbumLyricsZine } from "../../_components/album-lyrics-zine";

export default async function AlbumZinePage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	return <PrivateAlbumLyricsZine slug={slug} />;
}
