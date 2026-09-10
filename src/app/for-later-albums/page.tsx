import { redirect } from "next/navigation";

export default async function ForLaterAlbumsRedirect({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const params = await searchParams;
	const query = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (typeof value === "string") {
			query.set(key, value);
		} else if (Array.isArray(value)) {
			for (const entry of value) {
				query.append(key, entry);
			}
		}
	}
	const serialized = query.toString();
	redirect(serialized ? `/albums/up-next?${serialized}` : "/albums/up-next");
}
