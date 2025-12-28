"use client";

import { useMutation, useQuery } from "convex/react";
import {
	BookOpen,
	Calendar,
	Clock,
	ExternalLink,
	Loader2,
	Printer,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

type Article = Doc<"articles">;

function ArticleListSkeleton() {
	return (
		<li className="rounded-lg border p-4">
			<div className="flex items-start gap-4">
				<Skeleton className="mt-1 h-4 w-4" />
				<div className="flex-1 space-y-2">
					<Skeleton className="h-6 w-3/4" />
					<div className="flex gap-4">
						<Skeleton className="h-4 w-32" />
						<Skeleton className="h-4 w-24" />
					</div>
					<Skeleton className="h-4 w-full" />
				</div>
				<Skeleton className="h-8 w-8" />
			</div>
		</li>
	);
}

function formatDate(dateString: string | undefined): string {
	if (!dateString) return "Unknown date";
	try {
		return new Date(dateString).toLocaleDateString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	} catch {
		return dateString;
	}
}

export default function ArticlesPage() {
	const router = useRouter();
	const [selectedArticles, setSelectedArticles] = useState<Set<Id<"articles">>>(
		new Set(),
	);

	const articles = useQuery(api.articles.listArticles, { limit: 100 });
	const stats = useQuery(api.articles.getStats);
	const deleteArticleMutation = useMutation(api.articles.deleteArticle);

	const articlesLoading = articles === undefined;

	function handleToggleArticle(articleId: Id<"articles">) {
		setSelectedArticles((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(articleId)) {
				newSet.delete(articleId);
			} else {
				newSet.add(articleId);
			}
			return newSet;
		});
	}

	function handleSelectAll() {
		if (!articles) return;
		if (selectedArticles.size === articles.length) {
			setSelectedArticles(new Set());
		} else {
			setSelectedArticles(new Set(articles.map((a) => a._id)));
		}
	}

	async function handleDelete(articleId: Id<"articles">) {
		try {
			await deleteArticleMutation({ id: articleId });
			setSelectedArticles((prev) => {
				const newSet = new Set(prev);
				newSet.delete(articleId);
				return newSet;
			});
			toast.success("Article deleted");
		} catch (error) {
			console.error("Error deleting article:", error);
			toast.error("Failed to delete article");
		}
	}

	function handlePrintSelected() {
		if (selectedArticles.size === 0) {
			toast.error("Please select at least one article");
			return;
		}
		const ids = Array.from(selectedArticles).join(",");
		router.push(`/articles/print?ids=${ids}`);
	}

	return (
		<main className="mx-auto max-w-4xl px-4 py-10">
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle className="flex items-center gap-2 text-2xl">
							<BookOpen className="h-6 w-6" />
							Article Reader
						</CardTitle>
						<div className="flex gap-2">
							<Button
								variant="outline"
								onClick={handlePrintSelected}
								disabled={selectedArticles.size === 0}
							>
								<Printer className="mr-2 h-4 w-4" />
								Print Selected ({selectedArticles.size})
							</Button>
							<Button asChild>
								<Link href="/articles/new">Save New Article</Link>
							</Button>
						</div>
					</div>
					{stats && (
						<p className="text-muted-foreground text-sm">
							{stats.total} article{stats.total !== 1 ? "s" : ""} saved
						</p>
					)}
				</CardHeader>
				<CardContent>
					{articlesLoading ? (
						<ul className="space-y-3">
							{["1", "2", "3"].map((key) => (
								<ArticleListSkeleton key={key} />
							))}
						</ul>
					) : articles && articles.length > 0 ? (
						<>
							<div className="mb-4 flex items-center gap-2">
								<Checkbox
									id="select-all"
									checked={
										articles.length > 0 &&
										selectedArticles.size === articles.length
									}
									onCheckedChange={handleSelectAll}
								/>
								<label
									htmlFor="select-all"
									className="cursor-pointer font-medium text-sm"
								>
									Select all
								</label>
							</div>
							<ul className="space-y-3">
								{articles.map((article: Article) => (
									<li
										key={article._id}
										className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
									>
										<div className="flex items-start gap-4">
											<Checkbox
												checked={selectedArticles.has(article._id)}
												onCheckedChange={() => handleToggleArticle(article._id)}
												className="mt-1"
											/>
											<div className="min-w-0 flex-1">
												<h3 className="font-semibold text-lg leading-tight">
													{article.title}
												</h3>
												<div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-sm">
													{article.siteName && (
														<span className="flex items-center gap-1">
															<ExternalLink className="h-3 w-3" />
															{article.siteName}
														</span>
													)}
													{article.author && <span>by {article.author}</span>}
													{article.publishedDate && (
														<span className="flex items-center gap-1">
															<Calendar className="h-3 w-3" />
															{formatDate(article.publishedDate)}
														</span>
													)}
													{article.readingTime && (
														<span className="flex items-center gap-1">
															<Clock className="h-3 w-3" />
															{article.readingTime} min read
														</span>
													)}
												</div>
												{article.excerpt && (
													<p className="mt-2 line-clamp-2 text-muted-foreground text-sm">
														{article.excerpt}
													</p>
												)}
												<p className="mt-1 text-muted-foreground text-xs">
													Saved{" "}
													{formatDate(new Date(article.savedAt).toISOString())}
												</p>
											</div>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => handleDelete(article._id)}
												title="Delete article"
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</div>
									</li>
								))}
							</ul>
						</>
					) : (
						<div className="py-12 text-center">
							<BookOpen className="mx-auto h-12 w-12 text-muted-foreground" />
							<h3 className="mt-4 font-semibold text-lg">No articles yet</h3>
							<p className="mt-2 text-muted-foreground text-sm">
								Save your first article to get started
							</p>
							<Button asChild className="mt-4">
								<Link href="/articles/new">Save New Article</Link>
							</Button>
						</div>
					)}
				</CardContent>
			</Card>
		</main>
	);
}
