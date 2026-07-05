import { AlbumLyricsEditor } from "../../_components/album-lyrics-editor";

export default async function AlbumLyricsEditPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	return <AlbumLyricsEditor slug={slug} />;
}
