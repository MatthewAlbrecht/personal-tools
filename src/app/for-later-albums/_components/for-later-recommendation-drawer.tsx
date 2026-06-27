"use client";

import { useMutation, useQuery } from "convex/react";
import { ChevronLeft, Disc3, ExternalLink } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
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
import { cn } from "~/lib/utils";
import { api } from "../../../../convex/_generated/api";
import {
	ADDED_TIMEFRAME_OPTIONS,
	type AddedTimeframeAnswer,
	type DurationBucketAnswer,
	QUESTION_LABELS,
	QUESTION_ORDER,
	RATING_TIER_OPTIONS,
	RECOMMENDATION_COUNT_OPTIONS,
	RELEASE_TIME_OPTIONS,
	type RatingTierAnswer,
	type RecommendationAnswers,
	type RecommendationOption,
	type RecommendationQuestionId,
	type ReleaseTimeAnswer,
	createDefaultRecommendationAnswers,
	nextRecommendationQuestion,
} from "../_utils/recommendation-state";
import type { ForLaterAlbumRowData } from "../_utils/types";

type RecommendationOptionsResult = {
	genres: RecommendationOption[];
	durations: RecommendationOption[];
};

type RecommendationResult = {
	recommendationId: string;
	rows: ForLaterAlbumRowData[];
	matchingCount: number;
	requestedCount: number;
	returnedCount: number;
	wasLimitedByPool: boolean;
};

export function ForLaterRecommendationDrawer({
	userId,
	open,
	onOpenChange,
}: {
	userId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [activeQuestion, setActiveQuestion] =
		useState<RecommendationQuestionId>("addedTimeframe");
	const [furthestQuestionIndex, setFurthestQuestionIndex] = useState(0);
	const [answers, setAnswers] = useState<RecommendationAnswers>(() =>
		createDefaultRecommendationAnswers(),
	);
	const [selectedTopLevelGenre, setSelectedTopLevelGenre] = useState<{
		key: string;
		label: string;
	} | null>(null);
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

	useEffect(() => {
		if (activeQuestion === "genre") {
			return;
		}

		setSelectedTopLevelGenre(null);
	}, [activeQuestion]);

	const recommendationOptions: RecommendationOptionsResult | undefined =
		useQuery(
			api.forLaterAlbums.listForLaterRecommendationOptions,
			open
				? {
						userId,
						parentGenreKey: selectedTopLevelGenre?.key,
					}
				: "skip",
		);

	const genreOptions = recommendationOptions?.genres ?? [];
	const durationOptions = recommendationOptions?.durations ?? [];

	async function handleRecommendNow(
		answersForRecommendation = answers,
	): Promise<void> {
		setIsRecommending(true);
		setRecommendationError(null);
		setRecommendationResult(null);

		try {
			const result = await createRecommendation({
				userId,
				answers: answersForRecommendation,
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
		setActiveQuestion("addedTimeframe");
		setFurthestQuestionIndex(0);
		setSelectedTopLevelGenre(null);
		clearRecommendationRequest();
	}

	function clearRecommendationRequest(): void {
		setRecommendationResult(null);
		setRecommendationError(null);
	}

	function handleQuestionAnswered(
		partialAnswers: Partial<RecommendationAnswers>,
	): void {
		const nextAnswers = { ...answers, ...partialAnswers };
		const nextQuestion = nextRecommendationQuestion(activeQuestion);
		const nextQuestionIndex = questionIndex(nextQuestion);

		setAnswers(nextAnswers);
		clearRecommendationRequest();

		if (activeQuestion === "count" && partialAnswers.count !== undefined) {
			void handleRecommendNow(nextAnswers);
			return;
		}

		setActiveQuestion(nextQuestion);
		setFurthestQuestionIndex((current) => Math.max(current, nextQuestionIndex));
	}

	function handleGenreSelected(genreKey: string): void {
		if (genreKey === "any") {
			setSelectedTopLevelGenre(null);
			handleQuestionAnswered({ genreKey });
			return;
		}

		if (selectedTopLevelGenre === null) {
			const label =
				genreOptions.find((option) => option.key === genreKey)?.label ??
				readableGenreLabelFromKey(genreKey);
			setSelectedTopLevelGenre({ key: genreKey, label });
			clearRecommendationRequest();
			return;
		}

		setSelectedTopLevelGenre(null);
		handleQuestionAnswered({ genreKey });
	}

	function handleGenreBack(): void {
		setSelectedTopLevelGenre(null);
		clearRecommendationRequest();
	}

	function handleActiveQuestionChange(
		question: RecommendationQuestionId,
	): void {
		if (question !== "genre") {
			setSelectedTopLevelGenre(null);
		}
		setActiveQuestion(question);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-5xl flex-col gap-0 p-0 sm:max-w-5xl">
				<DialogHeader className="shrink-0 gap-2 border-b p-6 pr-12 text-left">
					<DialogTitle>Recommend from For Later</DialogTitle>
					<DialogDescription>
						Pick a few preferences, then ask for a random album from your For
						Later list.
					</DialogDescription>
				</DialogHeader>

				<div className="min-h-0 flex-1 overflow-y-auto p-6">
					{recommendationResult || isRecommending || recommendationError ? (
						<RecommendationResults
							result={recommendationResult}
							isLoading={isRecommending}
							error={recommendationError}
						/>
					) : (
						<div className="space-y-5">
							<StepNavigation
								activeQuestion={activeQuestion}
								furthestQuestionIndex={furthestQuestionIndex}
								onChange={handleActiveQuestionChange}
								onReachQuestion={(question) =>
									setFurthestQuestionIndex((current) =>
										Math.max(current, questionIndex(question)),
									)
								}
							/>

							<section className="bg-card p-4">
								<QuestionBody
									activeQuestion={activeQuestion}
									answers={answers}
									genreOptions={genreOptions}
									durationOptions={durationOptions}
									selectedTopLevelGenre={selectedTopLevelGenre}
									optionsLoading={open && recommendationOptions === undefined}
									onAnswer={handleQuestionAnswered}
									onGenreSelected={handleGenreSelected}
									onGenreBack={handleGenreBack}
								/>
							</section>
						</div>
					)}
				</div>

				<div className="flex shrink-0 justify-end border-t p-4">
					{recommendationResult || isRecommending || recommendationError ? (
						<Button
							type="button"
							onClick={resetRecommendationState}
							disabled={isRecommending}
						>
							Another recommendation
						</Button>
					) : (
						<Button
							type="button"
							onClick={() => void handleRecommendNow()}
							disabled={isRecommending}
						>
							Recommend now
						</Button>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

function StepNavigation({
	activeQuestion,
	furthestQuestionIndex,
	onChange,
	onReachQuestion,
}: {
	activeQuestion: RecommendationQuestionId;
	furthestQuestionIndex: number;
	onChange: (question: RecommendationQuestionId) => void;
	onReachQuestion: (question: RecommendationQuestionId) => void;
}) {
	return (
		<nav
			className="grid grid-cols-2 gap-x-0 gap-y-3 sm:flex sm:items-center"
			aria-label="Recommendation questions"
		>
			{QUESTION_ORDER.map((question, index) => {
				const isActive = activeQuestion === question;
				const hasReached = index <= furthestQuestionIndex;

				return (
					<div
						key={question}
						className="flex min-w-0 items-center sm:flex-1 sm:last:flex-none"
					>
						<button
							type="button"
							className={cn(
								"shrink-0 bg-transparent p-0 text-left font-medium text-xs underline-offset-4 transition-colors hover:text-foreground hover:underline",
								isActive
									? "text-foreground"
									: hasReached
										? "text-muted-foreground"
										: "text-muted-foreground/45",
							)}
							onClick={() => {
								onChange(question);
								onReachQuestion(question);
							}}
							aria-current={isActive ? "step" : undefined}
						>
							{QUESTION_LABELS[question]}
						</button>
						{index < QUESTION_ORDER.length - 1 ? (
							<span
								className={cn(
									"mx-3 hidden h-px flex-1 sm:block",
									index < furthestQuestionIndex
										? "bg-muted-foreground/50"
										: "bg-border",
								)}
								aria-hidden="true"
							/>
						) : null}
					</div>
				);
			})}
		</nav>
	);
}

function QuestionBody({
	activeQuestion,
	answers,
	genreOptions,
	durationOptions,
	selectedTopLevelGenre,
	optionsLoading,
	onAnswer,
	onGenreSelected,
	onGenreBack,
}: {
	activeQuestion: RecommendationQuestionId;
	answers: RecommendationAnswers;
	genreOptions: RecommendationOption[];
	durationOptions: RecommendationOption[];
	selectedTopLevelGenre: { key: string; label: string } | null;
	optionsLoading: boolean;
	onAnswer: (partialAnswers: Partial<RecommendationAnswers>) => void;
	onGenreSelected: (genreKey: string) => void;
	onGenreBack: () => void;
}) {
	if (activeQuestion === "addedTimeframe") {
		return (
			<QuestionSection title="Added within the last:">
				{ADDED_TIMEFRAME_OPTIONS.map((option) => (
					<ChoiceButton
						key={option.key}
						selected={answers.addedTimeframe === option.key}
						onClick={() =>
							onAnswer({ addedTimeframe: option.key as AddedTimeframeAnswer })
						}
					>
						{option.label}
					</ChoiceButton>
				))}
			</QuestionSection>
		);
	}

	if (activeQuestion === "genre") {
		return (
			<GenreQuestionSection
				selectedKey={answers.genreKey}
				options={genreOptions}
				selectedTopLevelGenre={selectedTopLevelGenre}
				optionsLoading={optionsLoading}
				onSelect={onGenreSelected}
				onBack={onGenreBack}
				emptyOptionsMessage="Genre choices appear after RYM data is linked for for-later albums."
			/>
		);
	}

	if (activeQuestion === "releaseTime") {
		return (
			<QuestionSection title="Release era:">
				{RELEASE_TIME_OPTIONS.map((option) => (
					<ChoiceButton
						key={option.key}
						selected={answers.releaseTime === option.key}
						onClick={() =>
							onAnswer({ releaseTime: option.key as ReleaseTimeAnswer })
						}
					>
						{option.label}
					</ChoiceButton>
				))}
			</QuestionSection>
		);
	}

	if (activeQuestion === "duration") {
		return (
			<QuestionSection title="Playlist duration:">
				<ChoiceButton
					selected={answers.durationBucket === "any"}
					onClick={() => onAnswer({ durationBucket: "any" })}
				>
					Doesn't matter
				</ChoiceButton>
				{durationOptions.map((option) => (
					<ChoiceButton
						key={option.key}
						selected={answers.durationBucket === option.key}
						onClick={() =>
							onAnswer({
								durationBucket: option.key as DurationBucketAnswer,
							})
						}
					>
						<span>{option.label}</span>
						<span className="text-muted-foreground text-xs">
							({option.count ?? 0})
						</span>
					</ChoiceButton>
				))}
				{optionsLoading ? (
					<span className="self-center text-muted-foreground text-xs">
						Loading options...
					</span>
				) : null}
			</QuestionSection>
		);
	}

	if (activeQuestion === "rating") {
		return (
			<QuestionSection title="Rating:">
				{RATING_TIER_OPTIONS.map((option) => (
					<ChoiceButton
						key={option.key}
						selected={answers.ratingTier === option.key}
						onClick={() =>
							onAnswer({ ratingTier: option.key as RatingTierAnswer })
						}
					>
						{option.label}
					</ChoiceButton>
				))}
			</QuestionSection>
		);
	}

	return (
		<QuestionSection title="# of recs:">
			{RECOMMENDATION_COUNT_OPTIONS.map((count) => (
				<ChoiceButton
					key={count}
					selected={answers.count === count}
					onClick={() => onAnswer({ count })}
				>
					{count}
				</ChoiceButton>
			))}
		</QuestionSection>
	);
}

function GenreQuestionSection({
	selectedKey,
	options,
	selectedTopLevelGenre,
	optionsLoading,
	onSelect,
	onBack,
	emptyOptionsMessage,
}: {
	selectedKey: string;
	options: RecommendationOption[];
	selectedTopLevelGenre: { key: string; label: string } | null;
	optionsLoading: boolean;
	onSelect: (key: string) => void;
	onBack: () => void;
	emptyOptionsMessage: string;
}) {
	const isSubgenreStep = selectedTopLevelGenre !== null;

	return (
		<QuestionSection
			title={isSubgenreStep ? "Subgenre:" : "Genre:"}
			description={
				isSubgenreStep
					? `Popular subgenres in ${selectedTopLevelGenre.label}`
					: "Top-level genres from your For Later library"
			}
		>
			{isSubgenreStep ? (
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="rounded-full"
					onClick={onBack}
				>
					<ChevronLeft className="size-3.5" />
					Back
				</Button>
			) : (
				<ChoiceButton
					selected={selectedKey === "any"}
					onClick={() => onSelect("any")}
				>
					Doesn't matter
				</ChoiceButton>
			)}
			{isSubgenreStep ? (
				<ChoiceButton
					selected={selectedKey === selectedTopLevelGenre.key}
					onClick={() => onSelect(selectedTopLevelGenre.key)}
				>
					<span>Any {selectedTopLevelGenre.label}</span>
				</ChoiceButton>
			) : null}
			{options.map((option) => (
				<ChoiceButton
					key={option.key}
					selected={!isSubgenreStep ? false : selectedKey === option.key}
					onClick={() => onSelect(option.key)}
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
			{!optionsLoading && options.length === 0 ? (
				<p className="basis-full text-muted-foreground text-xs">
					{emptyOptionsMessage}
				</p>
			) : null}
		</QuestionSection>
	);
}

function QuestionSection({
	title,
	description,
	children,
}: {
	title: string;
	description?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-3">
			<div className="space-y-1">
				<h3 className="font-semibold text-base">{title}</h3>
				{description ? (
					<p className="text-muted-foreground text-sm">{description}</p>
				) : null}
			</div>
			<div className="flex flex-wrap gap-2">{children}</div>
		</div>
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

function questionIndex(question: RecommendationQuestionId): number {
	return QUESTION_ORDER.indexOf(question);
}
