"use client";

import { useForm } from "@tanstack/react-form";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "~/trpc/react";

type FormValues = {
	title: string;
	author: string;
	hardcover: boolean;
	firstEdition: boolean;
	isbn?: string;
	folioSociety: boolean;
};

type BookSearch = {
	id: number;
	title: string;
	author: string;
	hardcover: boolean;
	firstEdition: boolean;
	folioSociety: boolean;
	isbn?: string | null;
	createdAt: Date;
	updatedAt: Date;
	titleNorm: string;
	authorNorm: string;
	isbnNorm: string;
};

function buildAbeBooksUrl(values: FormValues): string {
	const params = new URLSearchParams();
	if (values.title) params.set("tn", values.title);
	if (values.author) params.set("an", values.author);
	if (values.isbn) params.set("isbn", values.isbn);
	if (values.folioSociety) params.set("pn", "folio society");
	// Attributes and filters
	const attrs: string[] = [];
	if (values.hardcover) {
		params.set("bi", "h");
		attrs.push("hc");
	}
	if (values.firstEdition) {
		params.set("fe", "on");
		attrs.push("fe");
	}
	if (attrs.length > 0) params.set("attrs", attrs.join(" "));
	// Sorting: 17 => Lowest price first
	params.set("sortby", "17");
	// Additional stable params similar to your sample
	params.set("ds", "30");
	params.set("dym", "on");
	params.set("rollup", "on");
	params.set("xdesc", "off");
	return `https://www.abebooks.com/servlet/SearchResults?${params.toString()}`;
}

function buildBiblioUrl(values: FormValues): string {
	const params = new URLSearchParams();
	params.set("stage", "1");
	if (values.author) params.set("author", values.author);
	if (values.title) params.set("title", values.title);
	if (values.isbn) params.set("keyisbn", values.isbn);
	if (values.hardcover) params.set("format", "hardcover");
	if (values.firstEdition) params.set("first", "y");
	if (values.folioSociety) params.set("publisher", "folio society");
	params.set("pageper", "20");
	params.set("omit_product_types", "bp,bd,ns");
	params.set("strip_common", "1");
	params.set("program", "1005");
	// Sorting: lowest price + shipping in US ascending
	params.set("order", "price_ship_usasc");
	return `https://www.biblio.com/search.php?${params.toString()}`;
}

function buildEbayUrl(values: FormValues): string {
	const keywords: string[] = [];
	if (values.title) keywords.push(values.title);
	if (values.author) keywords.push(values.author);
	if (values.isbn) keywords.push(values.isbn);
	if (values.folioSociety) keywords.push("Folio Society");
	if (values.hardcover) keywords.push('"hardcover"');
	if (values.firstEdition) keywords.push('"1st"');
	const params = new URLSearchParams({
		_nkw: keywords.join(" "),
		_sacat: "0",
		_sop: "15", // Price + Shipping: lowest first
	});
	return `https://www.ebay.com/sch/i.html?${params.toString()}`;
}

function buildEbayCompletedUrl(values: FormValues): string {
	const keywords: string[] = [];
	if (values.title) keywords.push(values.title);
	if (values.author) keywords.push(values.author);
	if (values.isbn) keywords.push(values.isbn);
	if (values.folioSociety) keywords.push("Folio Society");
	if (values.hardcover) keywords.push('"hardcover"');
	if (values.firstEdition) keywords.push('"1st"');
	const params = new URLSearchParams({
		_nkw: keywords.join(" "),
		_sacat: "0",
		LH_Complete: "1",
	});
	return `https://www.ebay.com/sch/i.html?${params.toString()}`;
}

function SearchResultSkeleton() {
	return (
		<li>
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<Skeleton className="h-4 w-32" />
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-4 w-20" />
				</div>
				<Skeleton className="h-8 w-16" />
			</div>
		</li>
	);
}

export default function BooksPage() {
	const [submitted, setSubmitted] = useState<FormValues | null>(null);
	const [isRefreshingLinks, setIsRefreshingLinks] = useState(false);
	const utils = api.useUtils();
	const { data: recent, isLoading: isRecentLoading } =
		api.bookSearch.listRecent.useQuery({ limit: 500 });
	const saveMutation = api.bookSearch.create.useMutation({
		onSuccess: async () => {
			await utils.bookSearch.listRecent.invalidate();
		},
	});
	const deleteMutation = api.bookSearch.delete.useMutation({
		onSuccess: async () => {
			await utils.bookSearch.listRecent.invalidate();
		},
	});

	const form = useForm({
		defaultValues: {
			title: "",
			author: "",
			hardcover: true,
			firstEdition: true,
			isbn: "",
			folioSociety: false,
		},
		onSubmit: async ({ value }) => {
			// Normalize ISBN in the UI as well (digits + optional X)
			const isbnClean = (value.isbn ?? "")
				.replace(/[^0-9Xx]/g, "")
				.toUpperCase();
			const next = { ...value, isbn: isbnClean || undefined };
			// Build links synchronously via state update; save non-blocking afterward
			setSubmitted(next);
			setIsRefreshingLinks(true);
			queueMicrotask(() => saveMutation.mutate(next));
			// Enforce a short loading animation to make the update obvious
			setTimeout(() => setIsRefreshingLinks(false), 480);
		},
	});

	const links = useMemo(() => {
		if (!submitted) return null;
		return {
			abebooks: buildAbeBooksUrl(submitted),
			biblio: buildBiblioUrl(submitted),
			ebay: buildEbayUrl(submitted),
			ebaySold: buildEbayCompletedUrl(submitted),
		};
	}, [submitted]);

	return (
		<main className="mx-auto max-w-2xl px-4 py-10">
			<Card>
				<CardHeader>
					<CardTitle className="text-2xl">Book Search Aggregator</CardTitle>
				</CardHeader>
				<CardContent>
					<form
						onSubmit={(e) => {
							e.preventDefault();
							form.handleSubmit();
						}}
						className="space-y-4"
					>
						<form.Field name="title">
							{(field) => (
								<div className="flex flex-col gap-1">
									<Label htmlFor="title">Title</Label>
									<Input
										id="title"
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="e.g., The Stranger"
									/>
								</div>
							)}
						</form.Field>

						<form.Field name="author">
							{(field) => (
								<div className="flex flex-col gap-1">
									<Label htmlFor="author">Author</Label>
									<Input
										id="author"
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="e.g., Albert Camus"
									/>
								</div>
							)}
						</form.Field>

						<form.Field name="isbn">
							{(field) => (
								<div className="flex flex-col gap-1">
									<Label htmlFor="isbn">ISBN</Label>
									<Input
										id="isbn"
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="e.g., 0394573439 or 9780394573434"
									/>
								</div>
							)}
						</form.Field>

						<div className="flex items-center gap-6">
							<form.Field name="hardcover">
								{(field) => (
									<Label className="inline-flex items-center gap-2">
										<Checkbox
											checked={field.state.value}
											onCheckedChange={(v) => field.handleChange(Boolean(v))}
										/>
										Hardcover
									</Label>
								)}
							</form.Field>
							<form.Field name="firstEdition">
								{(field) => (
									<Label className="inline-flex items-center gap-2">
										<Checkbox
											checked={field.state.value}
											onCheckedChange={(v) => field.handleChange(Boolean(v))}
										/>
										First edition
									</Label>
								)}
							</form.Field>
							<form.Field name="folioSociety">
								{(field) => (
									<Label className="inline-flex items-center gap-2">
										<Checkbox
											checked={field.state.value}
											onCheckedChange={(v) => field.handleChange(Boolean(v))}
										/>
										Folio Society
									</Label>
								)}
							</form.Field>
						</div>

						<Separator />
						<Button type="submit" variant="outline">
							Generate links
						</Button>
					</form>
					{links && (
						<div className="mt-6 space-y-3" aria-busy={isRefreshingLinks}>
							<div className="flex items-center gap-2">
								<h2 className="font-semibold text-lg">Links</h2>
								{isRefreshingLinks ? (
									<Loader2 className="size-4 animate-spin text-muted-foreground" />
								) : null}
							</div>
							<div
								className={`flex flex-wrap items-center gap-3 ${isRefreshingLinks ? "opacity-60 transition-opacity" : ""}`}
							>
								<Button asChild variant="outline" className="rounded-full">
									<a
										className="inline-flex items-center gap-1"
										href={links.biblio}
										target="_blank"
										rel="noreferrer noopener"
									>
										Biblio <ArrowUpRight className="size-4" />
									</a>
								</Button>
								<Button asChild variant="outline" className="rounded-full">
									<a
										className="inline-flex items-center gap-1"
										href={links.abebooks}
										target="_blank"
										rel="noreferrer noopener"
									>
										AbeBooks <ArrowUpRight className="size-4" />
									</a>
								</Button>
								<Button asChild variant="outline" className="rounded-full">
									<a
										className="inline-flex items-center gap-1"
										href={links.ebay}
										target="_blank"
										rel="noreferrer noopener"
									>
										eBay — for sale <ArrowUpRight className="size-4" />
									</a>
								</Button>
								<Button asChild variant="outline" className="rounded-full">
									<a
										className="inline-flex items-center gap-1"
										href={links.ebaySold}
										target="_blank"
										rel="noreferrer noopener"
									>
										eBay — sold <ArrowUpRight className="size-4" />
									</a>
								</Button>
							</div>
						</div>
					)}
					<Separator className="my-6" />
					<div>
						<h2 className="mb-2 font-semibold text-lg">Recent searches</h2>
						<ul className="space-y-2">
							{isRecentLoading
								? // Show skeleton items while loading
									[
										"skeleton-1",
										"skeleton-2",
										"skeleton-3",
										"skeleton-4",
										"skeleton-5",
									].map((key) => <SearchResultSkeleton key={key} />)
								: (recent ?? []).map((s: BookSearch) => (
										<li key={s.id}>
											<div className="flex items-center justify-between gap-3">
												<Button
													variant="ghost"
													className="px-0"
													onClick={() => {
														setIsRefreshingLinks(true);
														form.setFieldValue("title", s.title);
														form.setFieldValue("author", s.author);
														form.setFieldValue("hardcover", s.hardcover);
														form.setFieldValue("firstEdition", s.firstEdition);
														form.setFieldValue("isbn", s.isbn ?? "");
														setSubmitted({
															title: s.title,
															author: s.author,
															hardcover: s.hardcover,
															firstEdition: s.firstEdition,
															isbn: s.isbn ?? undefined,
															folioSociety: s.folioSociety,
														});
														setTimeout(() => setIsRefreshingLinks(false), 480);
													}}
												>
													{s.author ? `${s.author} — ` : ""}
													{s.title || "(no title)"}
													{s.hardcover ? " • Hardcover" : ""}
													{s.firstEdition ? " • First ed." : ""}
												</Button>
												<Button
													variant="outline"
													size="sm"
													onClick={() => {
														deleteMutation.mutate({ id: s.id });
													}}
												>
													Delete
												</Button>
											</div>
										</li>
									))}
						</ul>
					</div>
				</CardContent>
			</Card>
		</main>
	);
}
