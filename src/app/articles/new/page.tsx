"use client";

import { useMutation } from "convex/react";
import { ArrowLeft, Link as LinkIcon, Loader2, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Separator } from "~/components/ui/separator";
import { api } from "../../../../convex/_generated/api";

export default function NewArticlePage() {
	const router = useRouter();
	const [url, setUrl] = useState("");
	const [html, setHtml] = useState("");
	const [isExtracting, setIsExtracting] = useState(false);
	const [mode, setMode] = useState<"url" | "html">("url");

	const createArticleMutation = useMutation(api.articles.createArticle);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();

		if (mode === "url" && !url.trim()) {
			toast.error("Please enter a URL");
			return;
		}

		if (mode === "html" && !html.trim()) {
			toast.error("Please paste HTML content");
			return;
		}

		setIsExtracting(true);

		try {
			// Extract article content using API
			const response = await fetch("/api/extract-article", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(
					mode === "url" ? { url: url.trim() } : { html: html.trim() },
				),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to extract article");
			}

			const extracted = await response.json();

			// Save to Convex
			await createArticleMutation({
				url: extracted.url,
				title: extracted.title,
				author: extracted.author || undefined,
				siteName: extracted.siteName || undefined,
				publishedDate: extracted.publishedDate || undefined,
				excerpt: extracted.excerpt || undefined,
				content: extracted.content,
				textContent: extracted.textContent,
				readingTime: extracted.readingTime || undefined,
			});

			toast.success("Article saved successfully!");
			router.push("/articles");
		} catch (error) {
			console.error("Error saving article:", error);
			toast.error(
				error instanceof Error ? error.message : "Failed to save article",
			);
		} finally {
			setIsExtracting(false);
		}
	}

	return (
		<main className="mx-auto max-w-2xl px-4 py-10">
			<div className="mb-6">
				<Button variant="ghost" asChild>
					<Link href="/articles">
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back to Articles
					</Link>
				</Button>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-2xl">
						<Save className="h-6 w-6" />
						Save New Article
					</CardTitle>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className="space-y-6">
						{/* Mode Selection */}
						<div className="flex gap-2">
							<Button
								type="button"
								variant={mode === "url" ? "default" : "outline"}
								onClick={() => setMode("url")}
								className="flex-1"
							>
								<LinkIcon className="mr-2 h-4 w-4" />
								From URL
							</Button>
							<Button
								type="button"
								variant={mode === "html" ? "default" : "outline"}
								onClick={() => setMode("html")}
								className="flex-1"
							>
								Paste HTML
							</Button>
						</div>

						<Separator />

						{mode === "url" ? (
							<div className="space-y-2">
								<Label htmlFor="url">Article URL</Label>
								<Input
									id="url"
									type="url"
									value={url}
									onChange={(e) => setUrl(e.target.value)}
									placeholder="https://example.com/article"
									disabled={isExtracting}
								/>
								<p className="text-muted-foreground text-xs">
									Enter the URL of the article you want to save
								</p>
							</div>
						) : (
							<div className="space-y-2">
								<Label htmlFor="html">HTML Content</Label>
								<textarea
									id="html"
									value={html}
									onChange={(e) => setHtml(e.target.value)}
									placeholder="Paste the full HTML of the article here..."
									disabled={isExtracting}
									className="min-h-[300px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
								/>
								<p className="text-muted-foreground text-xs">
									Paste the entire HTML source of the article page
								</p>
							</div>
						)}

						<div className="flex gap-2">
							<Button
								type="submit"
								disabled={isExtracting}
								className="flex-1"
							>
								{isExtracting ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Extracting Article...
									</>
								) : (
									<>
										<Save className="mr-2 h-4 w-4" />
										Save Article
									</>
								)}
							</Button>
							<Button
								type="button"
								variant="outline"
								onClick={() => router.push("/articles")}
								disabled={isExtracting}
							>
								Cancel
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
		</main>
	);
}


