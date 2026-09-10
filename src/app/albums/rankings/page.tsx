import { redirect } from "next/navigation";

export default function AlbumsRankingsRedirect() {
	redirect("/albums/rated");
}
