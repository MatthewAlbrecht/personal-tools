import { redirect } from "next/navigation";

export default function ConcertsPage() {
	redirect("/concerts/upcoming");
}
