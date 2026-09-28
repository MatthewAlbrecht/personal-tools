import { v } from "convex/values";
import { action } from "./_generated/server";
import { requireAuth } from "./auth";

export const previewLink = action({
	args: { url: v.string() },
	returns: v.object({
		url: v.string(),
		title: v.string(),
		faviconUrl: v.string(),
	}),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const url = normalizeLaunchUrl(args.url);
		if (!url) throw new Error("URL is required");
		if (isLocalUrl(url)) {
			return {
				url,
				title: titleSuggestionFromUrl(url),
				faviconUrl: fallbackFaviconUrl(url),
			};
		}
		try {
			const response = await fetch(url, {
				redirect: "follow",
				headers: {
					Accept: "text/html,application/xhtml+xml",
					"User-Agent": "LaunchBookmarkPreview/1.0",
				},
			});
			if (!response.ok) {
				return fallbackPreview(url);
			}
			const html = await response.text();
			const resolvedUrl = response.url || url;
			const preview = extractLinkPreview(resolvedUrl, html);
			return { url: resolvedUrl, ...preview };
		} catch {
			return fallbackPreview(url);
		}
	},
});

export function extractLinkPreview(
	pageUrl: string,
	html: string,
): { title: string; faviconUrl: string } {
	return {
		title: extractTitleFromHtml(html) || titleSuggestionFromUrl(pageUrl),
		faviconUrl: extractFaviconFromHtml(pageUrl, html),
	};
}

function fallbackPreview(url: string): {
	url: string;
	title: string;
	faviconUrl: string;
} {
	return {
		url,
		title: titleSuggestionFromUrl(url),
		faviconUrl: fallbackFaviconUrl(url),
	};
}

function extractFaviconFromHtml(pageUrl: string, html: string): string {
	for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
		const tag = match[0];
		const rel = attributeValue(tag, "rel");
		if (!rel?.split(/\s+/).some((value) => value.toLowerCase() === "icon")) {
			continue;
		}
		const href = attributeValue(tag, "href");
		if (!href || href.trim().toLowerCase() === "data:,") continue;
		try {
			return new URL(decodeHtmlEntities(href), pageUrl).toString();
		} catch {}
	}
	return fallbackFaviconUrl(pageUrl);
}

function attributeValue(tag: string, name: string): string {
	const match = tag.match(
		new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
	);
	return match?.[1] ?? match?.[2] ?? match?.[3] ?? "";
}

function fallbackFaviconUrl(pageUrl: string): string {
	try {
		return new URL("/favicon.ico", pageUrl).toString();
	} catch {
		return "";
	}
}

function normalizeLaunchUrl(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return "";
	const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
		? trimmed
		: `https://${trimmed}`;
	return stripUtm(withScheme);
}

function stripUtm(value: string): string {
	try {
		const parsed = new URL(value);
		for (const key of [...parsed.searchParams.keys()]) {
			if (key.toLowerCase().startsWith("utm_")) parsed.searchParams.delete(key);
		}
		return parsed.toString();
	} catch {
		return value;
	}
}

function isLocalUrl(value: string): boolean {
	try {
		const host = new URL(value).hostname.toLowerCase();
		return (
			host === "localhost" ||
			host === "127.0.0.1" ||
			host === "[::1]" ||
			host === "::1"
		);
	} catch {
		return false;
	}
}

function titleSuggestionFromUrl(value: string): string {
	try {
		const parsed = new URL(normalizeLaunchUrl(value));
		const host = parsed.hostname.replace(/^www\./i, "");
		const path = parsed.pathname.replace(/\/+$/, "");
		if (!path || path === "/") return host || "Untitled";
		const segment = decodeURIComponent(
			path.split("/").filter(Boolean).pop() || host,
		);
		const cleaned = segment
			.replace(/\.[a-z0-9]{1,5}$/i, "")
			.replace(/[-_]+/g, " ")
			.trim();
		return cleaned || host || "Untitled";
	} catch {
		return "Untitled";
	}
}

function extractTitleFromHtml(html: string): string {
	const og =
		html.match(
			/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
		) ||
		html.match(
			/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
		);
	if (og?.[1]?.trim()) return decodeHtmlEntities(og[1].trim());
	const title = html.match(/<title[^>]*>([^<]*)<\/title>/i);
	if (title?.[1]?.trim()) return decodeHtmlEntities(title[1].trim());
	return "";
}

function decodeHtmlEntities(value: string): string {
	return value
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");
}
