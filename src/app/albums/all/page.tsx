import { redirect } from "next/navigation";

export default function AlbumsAllRedirect() {
	redirect("/albums/library");
}
