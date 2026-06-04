import { PublicAlbumLyricsZine } from "../../../../lyrics/_components/album-lyrics-zine";

export default async function PublicAlbumZinePage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	return <PublicAlbumLyricsZine slug={slug} />;
}
