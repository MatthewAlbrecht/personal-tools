import { type NextRequest, NextResponse } from "next/server";

type ExtractedArticle = {
	title: string;
	author: string | null;
	siteName: string | null;
	publishedDate: string | null;
	excerpt: string | null;
	content: string;
	textContent: string;
	readingTime: number;
	url: string;
};

function calculateReadingTime(text: string): number {
	const wordsPerMinute = 200;
	const words = text.trim().split(/\s+/).length;
	return Math.ceil(words / wordsPerMinute);
}

export async function POST(request: NextRequest) {
	try {
		console.log("[Article Extract] Starting extraction...");

		// Import at runtime to avoid bundling issues
		const { parseHTML } = await import("linkedom");
		const { Readability } = await import("@mozilla/readability");
		console.log("[Article Extract] Modules loaded");

		const body = await request.json();
		const { url, html } = body as { url?: string; html?: string };

		console.log("[Article Extract] Request:", {
			hasUrl: !!url,
			hasHtml: !!html,
		});

		if (!url && !html) {
			console.log("[Article Extract] Error: No URL or HTML provided");
			return NextResponse.json(
				{ error: "Either url or html must be provided" },
				{ status: 400 },
			);
		}

		let htmlContent: string;
		let finalUrl: string;

		if (url) {
			console.log("[Article Extract] Fetching URL:", url);
			// Fetch the URL
			const response = await fetch(url, {
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
				},
			});

			console.log(
				"[Article Extract] Fetch status:",
				response.status,
				response.statusText,
			);

			if (!response.ok) {
				return NextResponse.json(
					{ error: `Failed to fetch URL: ${response.statusText}` },
					{ status: response.status },
				);
			}

			htmlContent = await response.text();
			console.log(
				"[Article Extract] HTML fetched, length:",
				htmlContent.length,
			);
			finalUrl = url;
		} else {
			htmlContent = html!;
			console.log(
				"[Article Extract] Using pasted HTML, length:",
				htmlContent.length,
			);
			finalUrl = "pasted-content";
		}

		// Parse with linkedom (lightweight JSDOM alternative)
		console.log("[Article Extract] Parsing with linkedom...");
		const { document } = parseHTML(htmlContent);

		console.log("[Article Extract] Extracting with Readability...");
		const reader = new Readability(document);
		const article = reader.parse();

		if (!article) {
			console.log("[Article Extract] Error: Readability returned null");
			return NextResponse.json(
				{ error: "Failed to extract article content" },
				{ status: 422 },
			);
		}

		console.log("[Article Extract] Article extracted:", {
			title: article.title,
			author: article.byline,
			contentLength: article.content?.length ?? 0,
			textLength: article.textContent?.length ?? 0,
		});

		// Get metadata from the DOM
		const siteName =
			document
				.querySelector('meta[property="og:site_name"]')
				?.getAttribute("content") ||
			document
				.querySelector('meta[name="application-name"]')
				?.getAttribute("content") ||
			null;

		const publishedDate =
			document
				.querySelector('meta[property="article:published_time"]')
				?.getAttribute("content") ||
			document
				.querySelector('meta[name="publish_date"]')
				?.getAttribute("content") ||
			null;

		const readingTime = calculateReadingTime(article.textContent ?? "");

		console.log("[Article Extract] Metadata:", {
			siteName,
			publishedDate,
			readingTime,
		});

		const extracted: ExtractedArticle = {
			title: article.title ?? "Untitled",
			author: article.byline ?? null,
			siteName: siteName ?? null,
			publishedDate: publishedDate ?? null,
			excerpt: article.excerpt ?? null,
			content: article.content ?? "",
			textContent: article.textContent ?? "",
			readingTime,
			url: finalUrl,
		};

		console.log("[Article Extract] Success! Returning extracted article");
		return NextResponse.json(extracted);
	} catch (error) {
		console.error("[Article Extract] ERROR:", error);
		console.error(
			"[Article Extract] Error stack:",
			error instanceof Error ? error.stack : "No stack",
		);
		return NextResponse.json(
			{
				error: "Failed to extract article",
				details: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}
