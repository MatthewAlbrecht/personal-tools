"use client";

import { useMutation, useQuery } from "convex/react";
import { Disc3, Pencil, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { AlbumRatingBadge } from "~/components/album-rating-badge";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Slider } from "~/components/ui/slider";
import { api } from "../../../../convex/_generated/api";
import {
	ADDED_DAYS_MIN,
	DURATION_MINUTES_MAX,
	DURATION_MINUTES_MIN,
	RATING_MAX,
	RATING_MIN,
	RECOMMENDATION_COUNT_OPTIONS,
	type RecommendationAnswers,
	type RecommendationFormFieldId,
	addedDaysAnswersToSliderValues,
	addedDaysSliderValuesToAnswers,
	answersToMutationPayload,
	buildRecommendationProseClauses,
	createDefaultRecommendationAnswers,
	formatAddedDaysRangeLabel,
	formatDurationRangeLabel,
	formatRatingRangeLabel,
	getAddedDaysMax,
	minutesFromMs,
	msFromMinutes,
	nextRecommendationWindow,
	pickRerollLoadingMs,
	visibleRecommendationRows,
} from "../_utils/recommendation-state";
import type { ForLaterAlbumRowData } from "../_utils/types";
import { YearRangePicker } from "./year-range-picker";

type RecommendationResult = {
	recommendationId: string;
	/** Prefetched pool (up to 10); UI shows a window via `offset`. */
	rows: ForLaterAlbumRowData[];
	offset: number;
	matchingCount: number;
	requestedCount: number;
	returnedCount: number;
	wasLimitedByPool: boolean;
};

type ViewMode = "form" | "results";

export function ForLaterRecommendationDrawer({
	userId,
	open,
	onOpenChange,
}: {
	userId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [view, setView] = useState<ViewMode>("form");
	const [answers, setAnswers] = useState<RecommendationAnswers>(() =>
		createDefaultRecommendationAnswers(),
	);
	const [genreSearch, setGenreSearch] = useState("");
	const [recommendationResult, setRecommendationResult] =
		useState<RecommendationResult | null>(null);
	const [recommendationError, setRecommendationError] = useState<string | null>(
		null,
	);
	const [isRecommending, setIsRecommending] = useState(false);
	const createRecommendation = useMutation(
		api.forLaterAlbums.createForLaterRecommendation,
	);

	useEffect(() => {
		if (open) {
			return;
		}

		resetRecommendationState();
	}, [open]);

	const recommendationOptions = useQuery(
		api.forLaterAlbums.listForLaterRecommendationOptions,
		open
			? {
					userId,
					search: genreSearch.trim() || undefined,
				}
			: "skip",
	);

	const genreOptions = recommendationOptions?.genres ?? [];
	const genreLabelsByKey = useMemo(() => {
		const labels: Record<string, string> = {};
		for (const option of genreOptions) {
			labels[option.key] = option.label;
		}
		for (const key of answers.genreKeys) {
			if (!(key in labels)) {
				labels[key] = readableGenreLabelFromKey(key);
			}
		}
		return labels;
	}, [answers.genreKeys, genreOptions]);

	const proseClauses = buildRecommendationProseClauses(answers, {
		genreLabelsByKey,
	});

	async function handleRecommendNow(
		answersForRecommendation = answers,
	): Promise<void> {
		setIsRecommending(true);
		setRecommendationError(null);
		setRecommendationResult(null);
		setView("results");

		try {
			const result = await createRecommendation({
				userId,
				answers: answersToMutationPayload(answersForRecommendation),
				now: Date.now(),
				seed: createClientSeed(),
			});
			setRecommendationResult({
				...result,
				offset: 0,
			});
		} catch (error) {
			console.error("Failed to create for-later recommendation", error);
			setRecommendationError("Could not create a recommendation. Try again.");
		} finally {
			setIsRecommending(false);
		}
	}

	async function handleReroll(): Promise<void> {
		if (!recommendationResult) {
			await handleRecommendNow(answers);
			return;
		}

		const next = nextRecommendationWindow(
			recommendationResult.offset,
			recommendationResult.requestedCount,
			recommendationResult.rows.length,
		);

		if (next.exhausted) {
			await handleRecommendNow(answers);
			return;
		}

		setIsRecommending(true);
		setRecommendationError(null);
		try {
			await wait(pickRerollLoadingMs());
			setRecommendationResult({
				...recommendationResult,
				offset: next.offset,
			});
		} finally {
			setIsRecommending(false);
		}
	}

	function resetRecommendationState(): void {
		setAnswers(createDefaultRecommendationAnswers());
		setGenreSearch("");
		setView("form");
		setRecommendationResult(null);
		setRecommendationError(null);
	}

	function patchAnswers(partial: Partial<RecommendationAnswers>): void {
		setAnswers((current) => {
			const next: RecommendationAnswers = { ...current, ...partial };
			const { yearMin: _omitMin, yearMax: _omitMax, ...withoutYears } = next;
			const clearedMin = "yearMin" in partial && partial.yearMin === undefined;
			const clearedMax = "yearMax" in partial && partial.yearMax === undefined;
			if (!clearedMin && !clearedMax) {
				return next;
			}
			return {
				...withoutYears,
				...(clearedMin ? {} : { yearMin: next.yearMin }),
				...(clearedMax ? {} : { yearMax: next.yearMax }),
			};
		});
	}

	function handleEditClause(fieldId: RecommendationFormFieldId): void {
		setRecommendationResult(null);
		setRecommendationError(null);
		setView("form");
		requestAnimationFrame(() => {
			document
				.querySelector(`[data-field="${fieldId}"]`)
				?.scrollIntoView({ block: "center" });
		});
	}

	function handleAddGenre(key: string): void {
		if (answers.genreKeys.includes(key)) {
			return;
		}
		patchAnswers({ genreKeys: [...answers.genreKeys, key] });
		setGenreSearch("");
	}

	function handleRemoveGenre(key: string): void {
		const nextKeys = answers.genreKeys.filter((genreKey) => genreKey !== key);
		patchAnswers({
			genreKeys: nextKeys,
			...(nextKeys.length === 0 ? { genreMatch: "any" as const } : {}),
		});
	}

	const showResults =
		view === "results" ||
		recommendationResult !== null ||
		isRecommending ||
		recommendationError !== null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-lg flex-col gap-0 p-0 sm:max-w-lg">
				<DialogHeader className="shrink-0 gap-2 border-b p-6 pr-12 text-left">
					<DialogTitle>Recommend from For Later</DialogTitle>
					<DialogDescription>
						Set filters, then ask for a random album from your For Later list.
					</DialogDescription>
				</DialogHeader>

				<div className="min-h-0 flex-1 overflow-y-auto p-6">
					{showResults ? (
						<div className="space-y-5">
							<RecommendationProse
								clauses={proseClauses}
								onEditClause={handleEditClause}
							/>
							<RecommendationResults
								result={recommendationResult}
								isLoading={isRecommending}
								error={recommendationError}
							/>
						</div>
					) : (
						<RecommendationForm
							answers={answers}
							genreOptions={genreOptions}
							genreSearch={genreSearch}
							optionsLoading={open && recommendationOptions === undefined}
							onGenreSearchChange={setGenreSearch}
							onPatchAnswers={patchAnswers}
							onAddGenre={handleAddGenre}
							onRemoveGenre={handleRemoveGenre}
						/>
					)}
				</div>

				<div className="flex shrink-0 justify-end gap-2 border-t p-4">
					{showResults ? (
						<>
							<Button
								type="button"
								variant="outline"
								onClick={resetRecommendationState}
								disabled={isRecommending}
							>
								Start over
							</Button>
							<Button
								type="button"
								onClick={() => void handleReroll()}
								disabled={isRecommending}
							>
								Re-roll
							</Button>
						</>
					) : (
						<Button
							type="button"
							onClick={() => void handleRecommendNow()}
							disabled={isRecommending}
						>
							Recommend
						</Button>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

function RecommendationForm({
	answers,
	genreOptions,
	genreSearch,
	optionsLoading,
	onGenreSearchChange,
	onPatchAnswers,
	onAddGenre,
	onRemoveGenre,
}: {
	answers: RecommendationAnswers;
	genreOptions: Array<{ key: string; label: string; count: number }>;
	genreSearch: string;
	optionsLoading: boolean;
	onGenreSearchChange: (value: string) => void;
	onPatchAnswers: (partial: Partial<RecommendationAnswers>) => void;
	onAddGenre: (key: string) => void;
	onRemoveGenre: (key: string) => void;
}) {
	const addedDaysMax = getAddedDaysMax();
	const durationMinMinutes = minutesFromMs(answers.durationMinMs);
	const durationMaxMinutes = minutesFromMs(answers.durationMaxMs);

	return (
		<div className="space-y-6">
			<section data-field="year" className="space-y-3">
				<div className="space-y-1">
					<h3 className="font-semibold text-base">Release year</h3>
				</div>
				<YearRangePicker
					yearMin={answers.yearMin}
					yearMax={answers.yearMax}
					onCommit={(bounds) => {
						onPatchAnswers({
							...(bounds.yearMin === undefined
								? { yearMin: undefined }
								: { yearMin: bounds.yearMin }),
							...(bounds.yearMax === undefined
								? { yearMax: undefined }
								: { yearMax: bounds.yearMax }),
						});
					}}
				/>
			</section>

			<section data-field="added" className="space-y-3">
				<div className="space-y-1">
					<h3 className="font-semibold text-base">Added</h3>
					<p className="text-muted-foreground text-sm">
						{formatAddedDaysRangeLabel(
							answers.addedDaysMin,
							answers.addedDaysMax,
							Date.now(),
						)}
					</p>
				</div>
				<Slider
					min={ADDED_DAYS_MIN}
					max={addedDaysMax}
					step={1}
					value={addedDaysAnswersToSliderValues(
						answers.addedDaysMin,
						answers.addedDaysMax,
						addedDaysMax,
					)}
					onValueChange={(value) => {
						const [sliderMin, sliderMax] = value;
						if (sliderMin === undefined || sliderMax === undefined) {
							return;
						}
						onPatchAnswers(
							addedDaysSliderValuesToAnswers(
								sliderMin,
								sliderMax,
								addedDaysMax,
							),
						);
					}}
				/>
			</section>

			<section data-field="listened" className="space-y-3">
				<div className="space-y-1">
					<h3 className="font-semibold text-base">Listened</h3>
				</div>
				<div className="flex flex-wrap gap-2">
					<ChoiceButton
						selected={answers.listened === "any"}
						onClick={() =>
							onPatchAnswers({
								listened: "any",
								ratingMin: RATING_MIN,
								ratingMax: RATING_MAX,
							})
						}
					>
						Any
					</ChoiceButton>
					<ChoiceButton
						selected={answers.listened === "heard"}
						onClick={() => onPatchAnswers({ listened: "heard" })}
					>
						Heard it
					</ChoiceButton>
					<ChoiceButton
						selected={answers.listened === "not_yet"}
						onClick={() =>
							onPatchAnswers({
								listened: "not_yet",
								ratingMin: RATING_MIN,
								ratingMax: RATING_MAX,
							})
						}
					>
						Not yet
					</ChoiceButton>
				</div>
			</section>

			{answers.listened === "heard" ? (
				<section data-field="rating" className="space-y-3">
					<div className="space-y-1">
						<h3 className="font-semibold text-base">Rating</h3>
						<p className="text-muted-foreground text-sm">
							{formatRatingRangeLabel(answers.ratingMin, answers.ratingMax)}
						</p>
					</div>
					<Slider
						min={RATING_MIN}
						max={RATING_MAX}
						step={1}
						value={[answers.ratingMin, answers.ratingMax]}
						onValueChange={(value) => {
							const [min, max] = value;
							if (min === undefined || max === undefined) {
								return;
							}
							onPatchAnswers({ ratingMin: min, ratingMax: max });
						}}
					/>
				</section>
			) : null}

			<section data-field="genre" className="space-y-3">
				<div className="space-y-1">
					<h3 className="font-semibold text-base">Genre</h3>
				</div>
				<Input
					value={genreSearch}
					onChange={(event) => onGenreSearchChange(event.target.value)}
					placeholder="Search genres..."
				/>
				{answers.genreKeys.length > 0 ? (
					<div className="flex flex-wrap items-center gap-2">
						{answers.genreKeys.map((key) => (
							<Badge key={key} variant="secondary" className="gap-1 pr-1">
								{readableGenreLabelFromKey(key)}
								<button
									type="button"
									className="rounded-full p-0.5 hover:bg-muted"
									aria-label={`Remove ${key}`}
									onClick={() => onRemoveGenre(key)}
								>
									<X className="size-3" />
								</button>
							</Badge>
						))}
						<div className="flex gap-1">
							<ChoiceButton
								selected={answers.genreMatch === "any"}
								onClick={() => onPatchAnswers({ genreMatch: "any" })}
							>
								Any
							</ChoiceButton>
							<ChoiceButton
								selected={answers.genreMatch === "all"}
								onClick={() => onPatchAnswers({ genreMatch: "all" })}
							>
								All
							</ChoiceButton>
						</div>
					</div>
				) : null}
				<div className="flex flex-wrap gap-2">
					{genreOptions.map((option) => (
						<ChoiceButton
							key={option.key}
							selected={answers.genreKeys.includes(option.key)}
							onClick={() => onAddGenre(option.key)}
						>
							<span>{option.label}</span>
							<span className="text-muted-foreground text-xs">
								({option.count})
							</span>
						</ChoiceButton>
					))}
					{optionsLoading ? (
						<span className="self-center text-muted-foreground text-xs">
							Loading options...
						</span>
					) : null}
					{!optionsLoading && genreOptions.length === 0 ? (
						<p className="basis-full text-muted-foreground text-xs">
							No genres match that search.
						</p>
					) : null}
				</div>
			</section>

			<section data-field="duration" className="space-y-3">
				<div className="space-y-1">
					<h3 className="font-semibold text-base">Duration</h3>
					<p className="text-muted-foreground text-sm">
						{formatDurationRangeLabel(durationMinMinutes, durationMaxMinutes)}
					</p>
				</div>
				<Slider
					min={DURATION_MINUTES_MIN}
					max={DURATION_MINUTES_MAX}
					step={1}
					value={[durationMinMinutes, durationMaxMinutes]}
					onValueChange={(value) => {
						const [min, max] = value;
						if (min === undefined || max === undefined) {
							return;
						}
						onPatchAnswers({
							durationMinMs: msFromMinutes(min),
							durationMaxMs: msFromMinutes(max),
						});
					}}
				/>
			</section>

			<section data-field="count" className="space-y-3">
				<div className="space-y-1">
					<h3 className="font-semibold text-base"># of recs</h3>
				</div>
				<div className="flex flex-wrap gap-2">
					{RECOMMENDATION_COUNT_OPTIONS.map((count) => (
						<ChoiceButton
							key={count}
							selected={answers.count === count}
							onClick={() => onPatchAnswers({ count })}
						>
							{count}
						</ChoiceButton>
					))}
				</div>
			</section>
		</div>
	);
}

function RecommendationProse({
	clauses,
	onEditClause,
}: {
	clauses: Array<{ id: RecommendationFormFieldId; text: string }>;
	onEditClause: (fieldId: RecommendationFormFieldId) => void;
}) {
	if (clauses.length === 0) {
		return (
			<p className="text-sm leading-relaxed">
				Selecting an album from your For Later list.
			</p>
		);
	}

	return (
		<p className="text-sm leading-relaxed">
			<span>Selecting an album that </span>
			{clauses.map((clause, index) => (
				<span key={clause.id} className="group/clause relative inline">
					{index > 0 ? ", " : null}
					{clause.text}
					<button
						type="button"
						className="absolute top-1/2 left-full z-10 ml-1 inline-flex -translate-y-1/2 opacity-0 transition-opacity group-hover/clause:opacity-100"
						aria-label={`Edit ${clause.id}`}
						onClick={() => onEditClause(clause.id)}
					>
						<Pencil className="size-3 text-muted-foreground" />
					</button>
				</span>
			))}
			.
		</p>
	);
}

function ChoiceButton({
	selected,
	onClick,
	children,
}: {
	selected: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<Button
			type="button"
			variant={selected ? "default" : "outline"}
			size="sm"
			className="rounded-full"
			onClick={onClick}
			aria-pressed={selected}
		>
			{children}
		</Button>
	);
}

function RecommendationResults({
	result,
	isLoading,
	error,
}: {
	result: RecommendationResult | null;
	isLoading: boolean;
	error: string | null;
}) {
	if (isLoading) {
		return (
			<section className="rounded-xl border p-4 text-muted-foreground text-sm">
				Loading recommendations...
			</section>
		);
	}

	if (error) {
		return (
			<section className="rounded-xl border p-4 text-muted-foreground text-sm">
				{error}
			</section>
		);
	}

	if (!result) {
		return null;
	}

	const visibleRows = visibleRecommendationRows(
		result.rows,
		result.offset,
		result.requestedCount,
	);
	const shownCount = visibleRows.length;

	return (
		<section className="space-y-4">
			<div className="flex items-center justify-between gap-3">
				<div>
					<h3 className="font-semibold text-base">Recommendations</h3>
					<p className="text-muted-foreground text-sm">
						{shownCount} of {result.requestedCount} shown from{" "}
						{result.matchingCount} matching albums.
					</p>
				</div>
			</div>
			{shownCount === 0 ? (
				<p className="text-muted-foreground text-xs">
					No matches for those answers. Try another recommendation after
					loosening one filter.
				</p>
			) : null}
			{shownCount < result.requestedCount ? (
				<p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700 text-xs dark:text-amber-300">
					Only {shownCount} matched the requested {result.requestedCount}.
				</p>
			) : null}
			<div className="grid gap-3">
				{visibleRows.map((row) => (
					<RecommendationResultCard key={row.id} row={row} />
				))}
			</div>
		</section>
	);
}

function RecommendationResultCard({ row }: { row: ForLaterAlbumRowData }) {
	const spotifyUrl = buildSpotifyAlbumUrl(row.spotifyAlbumId);

	return (
		<article className="rounded-xl border bg-card p-3">
			<div className="flex items-start gap-3">
				<div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-muted">
					{row.imageUrl ? (
						<Image
							src={row.imageUrl}
							alt={row.name}
							fill
							className="object-cover"
							sizes="64px"
						/>
					) : (
						<div className="flex h-full w-full items-center justify-center">
							<Disc3 className="size-5 text-muted-foreground/60" />
						</div>
					)}
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-start gap-4">
						<div className="min-w-0 flex-1">
							<h4 className="truncate font-semibold text-sm leading-tight">
								{row.name}
							</h4>
							<p className="truncate text-muted-foreground text-xs leading-tight">
								{row.artistName}
							</p>
							<p className="mt-0.5 text-muted-foreground text-xs leading-tight">
								{[
									row.releaseYear,
									row.hasListened ? "Listened" : "Not listened",
								]
									.filter(Boolean)
									.join(" · ")}
							</p>
						</div>
						<div className="flex shrink-0 flex-col items-end gap-1.5">
							{spotifyUrl ? (
								<a
									href={spotifyUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="text-[#1DB954] transition-opacity hover:opacity-80"
									aria-label={`Open ${row.name} on Spotify`}
								>
									<SpotifyLogoIcon className="size-5" />
								</a>
							) : null}
							{row.rating !== undefined ? (
								<AlbumRatingBadge rating={row.rating} />
							) : null}
						</div>
					</div>
					<div className="mt-2">
						<RecommendationTaxonomyLines
							primaryGenres={row.primaryGenres}
							secondaryGenres={row.secondaryGenres}
							descriptors={row.descriptors}
						/>
					</div>
				</div>
			</div>
		</article>
	);
}

function SpotifyLogoIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			role="img"
			aria-hidden="true"
			fill="currentColor"
		>
			<path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
		</svg>
	);
}

function RecommendationTaxonomyLines({
	primaryGenres,
	secondaryGenres,
	descriptors,
}: {
	primaryGenres: Array<{ key: string; label: string }>;
	secondaryGenres: Array<{ key: string; label: string }>;
	descriptors: Array<{ key: string; label: string }>;
}) {
	const primary = joinTagLabels(primaryGenres);
	const secondary = joinTagLabels(secondaryGenres);
	const descriptorLine = joinTagLabels(descriptors);

	if (!primary && !secondary && !descriptorLine) {
		return null;
	}

	return (
		<div>
			{(primary || secondary) && (
				<div className="space-y-0.5">
					{primary ? (
						<p className="font-medium text-sm text-foreground leading-snug">
							{primary}
						</p>
					) : null}
					{secondary ? (
						<p className="text-foreground/80 text-xs leading-snug font-normal">
							{secondary}
						</p>
					) : null}
				</div>
			)}
			{descriptorLine ? (
				<p className="mt-2 text-muted-foreground text-[11px] leading-snug">
					{descriptorLine}
				</p>
			) : null}
		</div>
	);
}

function joinTagLabels(tags: Array<{ key: string; label: string }>): string {
	return tags
		.map((tag) => tag.label.trim())
		.filter(Boolean)
		.join(", ");
}

function buildSpotifyAlbumUrl(spotifyAlbumId: string): string | null {
	const trimmedId = spotifyAlbumId.trim();
	if (!trimmedId) {
		return null;
	}

	return `https://open.spotify.com/album/${trimmedId}`;
}

function createClientSeed(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => {
		window.setTimeout(resolve, ms);
	});
}

function readableGenreLabelFromKey(key: string): string {
	return key
		.split(/[\s_-]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}
