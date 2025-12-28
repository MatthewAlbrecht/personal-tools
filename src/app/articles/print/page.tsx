"use client";

import { useQuery } from "convex/react";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Button } from "~/components/ui/button";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";

type Article = Doc<"articles">;

function formatDate(dateString: string | undefined): string {
	if (!dateString) return "";
	try {
		return new Date(dateString).toLocaleDateString("en-US", {
			year: "numeric",
			month: "long",
			day: "numeric",
		});
	} catch {
		return dateString;
	}
}

function PrintContent() {
	const searchParams = useSearchParams();
	const idsParam = searchParams?.get("ids") ?? null;

	const articleIds = idsParam ? (idsParam.split(",") as Id<"articles">[]) : [];

	const articles = useQuery(
		api.articles.getArticlesByIds,
		articleIds.length > 0 ? { ids: articleIds } : "skip",
	);

	if (!articles) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<Loader2 className="h-8 w-8 animate-spin" />
			</div>
		);
	}

	if (articles.length === 0) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<div className="text-center">
					<p className="text-muted-foreground">No articles selected</p>
					<Button asChild className="mt-4">
						<Link href="/articles">Go to Articles</Link>
					</Button>
				</div>
			</div>
		);
	}

	const oldestDate = Math.min(...articles.map((a) => a.savedAt));
	const newestDate = Math.max(...articles.map((a) => a.savedAt));

	return (
		<>
			{/* Print-only styles */}
			<style
				dangerouslySetInnerHTML={{
					__html: `
				@media print {
					@page {
						margin: 0.75in;
						size: letter;
					}
					
					body {
						margin: 0;
						padding: 0;
					}
					
					.no-print {
						display: none !important;
					}
					
					.print-title-page {
						page-break-after: always;
						display: flex;
						flex-direction: column;
						justify-content: center;
						align-items: center;
						min-height: 100vh;
						text-align: center;
					}
					
					.print-article {
						page-break-after: always;
						page-break-inside: avoid;
					}
					
					.print-article:last-child {
						page-break-after: auto;
					}
					
					.print-article h1 {
						font-size: 24pt;
						font-weight: bold;
						margin-bottom: 12pt;
						color: #000;
					}
					
					.print-article h2 {
						font-size: 18pt;
						font-weight: bold;
						margin-top: 16pt;
						margin-bottom: 10pt;
						color: #000;
					}
					
					.print-article h3 {
						font-size: 14pt;
						font-weight: bold;
						margin-top: 12pt;
						margin-bottom: 8pt;
						color: #000;
					}
					
					.print-article h4, .print-article h5, .print-article h6 {
						font-size: 12pt;
						font-weight: bold;
						margin-top: 10pt;
						margin-bottom: 6pt;
						color: #000;
					}
					
					.print-article p {
						font-size: 12pt;
						line-height: 1.6;
						margin-top: 0;
						margin-bottom: 12pt;
						color: #000;
					}
					
					.print-article .prose p {
						margin-bottom: 12pt;
					}
					
					.print-article div > p {
						margin-bottom: 12pt;
					}
					
					.print-article-meta {
						font-size: 10pt;
						color: #666;
						margin-bottom: 20pt;
						padding-bottom: 12pt;
						border-bottom: 1px solid #ccc;
					}
					
					.print-article img {
						max-width: 100%;
						height: auto;
						page-break-inside: avoid;
					}
					
					.print-article a {
						color: #000;
						text-decoration: none;
					}
					
					.print-article blockquote {
						border-left: 3pt solid #ccc;
						padding-left: 12pt;
						margin-left: 0;
						font-style: italic;
					}
					
					.print-article pre {
						background: #f5f5f5;
						padding: 8pt;
						border: 1px solid #ddd;
						overflow: hidden;
						font-size: 10pt;
					}
					
					.print-article code {
						background: #f5f5f5;
						padding: 2pt 4pt;
						font-size: 10pt;
						font-family: 'Courier New', monospace;
					}
					
					.print-article ul, .print-article ol {
						margin-top: 8pt;
						margin-bottom: 12pt;
					}
					
					.print-article li {
						margin-bottom: 4pt;
					}
					
					.print-article div {
						margin-bottom: 0;
					}
				}
				
				@media screen {
					.print-container {
						max-width: 8.5in;
						margin: 0 auto;
						padding: 2rem;
						background: white;
					}
					
					.print-title-page {
						min-height: 11in;
						display: flex;
						flex-direction: column;
						justify-content: center;
						align-items: center;
						text-align: center;
						border-bottom: 2px solid #e5e7eb;
						margin-bottom: 2rem;
					}
					
					.print-article {
						margin-bottom: 3rem;
						padding-bottom: 2rem;
						border-bottom: 2px solid #e5e7eb;
					}
					
					.print-article:last-child {
						border-bottom: none;
					}
					
					.print-article h1 {
						font-size: 2rem;
						font-weight: bold;
						margin-bottom: 1rem;
					}
					
					.print-article h2 {
						font-size: 1.5rem;
						font-weight: bold;
						margin-top: 1.5rem;
						margin-bottom: 0.75rem;
					}
					
				.print-article h3 {
					font-size: 1.25rem;
					font-weight: bold;
					margin-top: 1.25rem;
					margin-bottom: 0.5rem;
				}
				
				.print-article h4, .print-article h5, .print-article h6 {
					font-size: 1rem;
					font-weight: bold;
					margin-top: 1rem;
					margin-bottom: 0.5rem;
				}
				
				.print-article p {
					font-size: 1rem;
					line-height: 1.6;
					margin-top: 0;
					margin-bottom: 1rem;
				}
				
				.print-article .prose p {
					margin-bottom: 1rem;
				}
				
				.print-article div > p {
					margin-bottom: 1rem;
				}
				
				.print-article ul, .print-article ol {
					margin-top: 0.75rem;
					margin-bottom: 1rem;
				}
				
				.print-article-meta {
					color: #6b7280;
					margin-bottom: 1.5rem;
					padding-bottom: 1rem;
					border-bottom: 1px solid #e5e7eb;
				}
			}
			`,
				}}
			/>

			{/* Screen-only controls */}
			<div className="no-print sticky top-0 z-50 border-b bg-white px-4 py-3">
				<div className="mx-auto flex max-w-4xl items-center justify-between">
					<Button variant="ghost" asChild>
						<Link href="/articles">
							<ArrowLeft className="mr-2 h-4 w-4" />
							Back to Articles
						</Link>
					</Button>
					<Button onClick={() => window.print()}>
						<Printer className="mr-2 h-4 w-4" />
						Print ({articles.length} article{articles.length !== 1 ? "s" : ""})
					</Button>
				</div>
			</div>

			<div className="print-container">
				{/* Title Page */}
				<div className="print-title-page">
					<h1 className="mb-4 font-bold text-4xl">Article Collection</h1>
					<p className="text-lg text-muted-foreground">
						{formatDate(new Date(oldestDate).toISOString())} —{" "}
						{formatDate(new Date(newestDate).toISOString())}
					</p>
					<p className="mt-2 text-muted-foreground">
						{articles.length} article{articles.length !== 1 ? "s" : ""}
					</p>
				</div>

				{/* Articles */}
				{articles.map((article: Article, index) => (
					<article key={article._id} className="print-article">
						<h1>{article.title}</h1>

						<div className="print-article-meta">
							{article.author && <div>By {article.author}</div>}
							{article.siteName && <div>{article.siteName}</div>}
							{article.publishedDate && (
								<div>Published: {formatDate(article.publishedDate)}</div>
							)}
							{article.readingTime && (
								<div>{article.readingTime} minute read</div>
							)}
							<div className="mt-1 text-xs">
								Source:{" "}
								{article.url !== "pasted-content"
									? article.url
									: "Pasted content"}
							</div>
						</div>

						<div
							dangerouslySetInnerHTML={{ __html: article.content }}
							className="prose max-w-none"
						/>
					</article>
				))}
			</div>
		</>
	);
}

export default function PrintPage() {
	return (
		<Suspense
			fallback={
				<div className="flex min-h-screen items-center justify-center">
					<Loader2 className="h-8 w-8 animate-spin" />
				</div>
			}
		>
			<PrintContent />
		</Suspense>
	);
}
