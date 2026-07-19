/**
 * Convex CLI may print WARN banners to stdout before JSON when a function
 * return is large. Strip those lines, then parse the JSON payload.
 */
export function parseConvexRunStdout(stdout: string): unknown {
	const trimmed = stdout.trim();
	if (!trimmed) return null;

	const withoutBanners = trimmed
		.split(/\r?\n/)
		.filter((line) => !line.startsWith("[CONVEX"))
		.join("\n")
		.trim();

	if (!withoutBanners) {
		throw new Error("convex run produced no JSON payload");
	}

	return JSON.parse(withoutBanners);
}
