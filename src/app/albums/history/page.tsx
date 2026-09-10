import { redirect } from "next/navigation";

export default function AlbumsHistoryRedirect() {
	redirect("/albums/recent");
}
