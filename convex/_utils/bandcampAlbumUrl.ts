export function normalizeBandcampAlbumUrl(raw: string): string {
	const trimmed = raw.trim();
	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		throw new Error("Invalid Bandcamp URL");
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error("Invalid Bandcamp URL protocol");
	}
	const host = url.hostname.toLowerCase().replace(/^www\./, "");
	if (!host.endsWith(".bandcamp.com") && host !== "bandcamp.com") {
		throw new Error("URL must be a bandcamp.com host");
	}
	const path = url.pathname.replace(/\/+$/, "") || "";
	if (!path.includes("/album/")) {
		throw new Error("URL must be a Bandcamp album page");
	}
	return `https://${host}${path}`;
}
