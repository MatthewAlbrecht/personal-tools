"use client";

import { useMutation, useQuery } from "convex/react";
import { Disc3, ExternalLink, Pencil, X } from "lucide-react";
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
	ADDED_DAYS_MAX,
	ADDED_DAYS_MIN,
	DURATION_MINUTES_MAX,
	DURATION_MINUTES_MIN,
	RATING_MAX,
	RATING_MIN,
	RECOMMENDATION_COUNT_OPTIONS,
	type RecommendationAnswers,
	type RecommendationFormFieldId,
	answersToMutationPayload,
	buildRecommendationProseClauses,
	createDefaultRecommendationAnswers,
	minutesFromMs,
	msFromMinutes,
} from "../_utils/recommendation-state";
import type { ForLaterAlbumRowData } from "../_utils/types";
import { YearRangePicker } from "./year-range-picker";

type RecommendationResult = {
	recommendationId: string;
	rows: ForLaterAlbumRowData[];
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
			setRecommendationResult(result);
		} catch (error) {
			console.error("Failed to create for-later recommendation", error);
			setRecommendationError("Could not create a recommendation. Try again.");
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
			<DialogContent className="flex max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-5xl flex-col gap-0 p-0 sm:max-w-5xl">
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
								onClick={() => void handleRecommendNow(answers)}
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
	return (
		<div className="space-y-6">
			<section data-field="added" className="space-y-3">
				<div className="space-y-1">
					<h3 className="font-semibold text-base">Added</h3>
					<p className="text-muted-foreground text-sm">
						{answers.addedDaysMin}–{answers.addedDaysMax} days ago
					</p>
				</div>
				<Slider
					min={ADDED_DAYS_MIN}
					max={ADDED_DAYS_MAX}
					step={1}
					value={[answers.addedDaysMin, answers.addedDaysMax]}
					onValueChange={(value) => {
						const [min, max] = value;
						if (min === undefined || max === undefined) {
							return;
						}
						onPatchAnswers({ addedDaysMin: min, addedDaysMax: max });
					}}
				/>
			</section>

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

			<section data-field="duration" className="space-y-3">
				<div className="space-y-1">
					<h3 className="font-semibold text-base">Duration</h3>
					<p className="text-muted-foreground text-sm">
						{minutesFromMs(answers.durationMinMs)}–
						{minutesFromMs(answers.durationMaxMs)} minutes
					</p>
				</div>
				<Slider
					min={DURATION_MINUTES_MIN}
					max={DURATION_MINUTES_MAX}
					step={1}
					value={[
						minutesFromMs(answers.durationMinMs),
						minutesFromMs(answers.durationMaxMs),
					]}
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

			<section data-field="rating" className="space-y-3">
				<div className="space-y-1">
					<h3 className="font-semibold text-base">Rating</h3>
					<p className="text-muted-foreground text-sm">
						{answers.ratingMin}–{answers.ratingMax}
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

			<section data-field="listened" className="space-y-3">
				<div className="space-y-1">
					<h3 className="font-semibold text-base">Listened</h3>
				</div>
				<div className="flex flex-wrap gap-2">
					<ChoiceButton
						selected={answers.listened === "any"}
						onClick={() => onPatchAnswers({ listened: "any" })}
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
						onClick={() => onPatchAnswers({ listened: "not_yet" })}
					>
						Not yet
					</ChoiceButton>
				</div>
			</section>

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
					{index > 0 ? <span>, </span> : null}
					{clause.text}
					<button
						type="button"
						className="ml-1 inline-flex opacity-0 transition-opacity group-hover/clause:opacity-100"
						aria-label={`Edit ${clause.id}`}
						onClick={() => onEditClause(clause.id)}
					>
						<Pencil className="size-3 text-muted-foreground" />
					</button>
				</span>
			))}
			<span>.</span>
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

	return (
		<section className="space-y-4">
			<div className="flex items-center justify-between gap-3">
				<div>
					<h3 className="font-semibold text-base">Recommendations</h3>
					<p className="text-muted-foreground text-sm">
						{result.returnedCount} of {result.requestedCount} shown from{" "}
						{result.matchingCount} matching albums.
					</p>
				</div>
			</div>
			{result.returnedCount === 0 ? (
				<p className="text-muted-foreground text-xs">
					No matches for those answers. Try another recommendation after
					loosening one filter.
				</p>
			) : null}
			{result.returnedCount < result.requestedCount ? (
				<p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700 text-xs dark:text-amber-300">
					Only {result.returnedCount} matched the requested{" "}
					{result.requestedCount}.
				</p>
			) : null}
			<div className="grid gap-3">
				{result.rows.map((row) => (
					<RecommendationResultCard key={row.id} row={row} />
				))}
			</div>
		</section>
	);
}

function RecommendationResultCard({ row }: { row: ForLaterAlbumRowData }) {
	const spotifyUrl = buildSpotifyAlbumUrl(row.spotifyAlbumId);

	return (
		<article className="rounded-xl border bg-card p-4">
			<div className="flex gap-4">
				<div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-muted">
					{row.imageUrl ? (
						<Image
							src={row.imageUrl}
							alt={row.name}
							fill
							className="object-cover"
							sizes="80px"
						/>
					) : (
						<div className="flex h-full w-full items-center justify-center">
							<Disc3 className="size-6 text-muted-foreground/60" />
						</div>
					)}
				</div>
				<div className="min-w-0 flex-1 space-y-3">
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0">
							<h4 className="truncate font-semibold text-base">{row.name}</h4>
							<p className="truncate text-muted-foreground text-sm">
								{row.artistName}
							</p>
							<div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
								{row.releaseYear ? <span>{row.releaseYear}</span> : null}
								<span>{row.hasListened ? "Listened" : "Not listened"}</span>
								<span>
									{row.rymStatus === "matched" ? "RYM matched" : "No RYM match"}
								</span>
							</div>
						</div>
						<div className="flex shrink-0 items-center gap-2">
							{row.rating !== undefined ? (
								<AlbumRatingBadge rating={row.rating} />
							) : null}
							{spotifyUrl ? (
								<a
									href={spotifyUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="text-muted-foreground transition-colors hover:text-foreground"
									aria-label={`Open ${row.name} on Spotify`}
								>
									<ExternalLink className="size-4" />
								</a>
							) : null}
						</div>
					</div>
					<RecommendationTagGroup label="Genres" tags={row.primaryGenres} />
					<RecommendationTagGroup
						label="Secondary"
						tags={row.secondaryGenres}
					/>
					<RecommendationTagGroup label="Descriptors" tags={row.descriptors} />
				</div>
			</div>
		</article>
	);
}

function RecommendationTagGroup({
	label,
	tags,
}: {
	label: string;
	tags: Array<{ key: string; label: string }>;
}) {
	if (tags.length === 0) {
		return null;
	}

	return (
		<div className="space-y-1">
			<p className="font-medium text-muted-foreground text-xs">{label}</p>
			<div className="flex flex-wrap gap-1">
				{tags.slice(0, 8).map((tag) => (
					<Badge key={tag.key} variant="secondary" className="text-[10px]">
						{tag.label}
					</Badge>
				))}
			</div>
		</div>
	);
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

function readableGenreLabelFromKey(key: string): string {
	return key
		.split(/[\s_-]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}
