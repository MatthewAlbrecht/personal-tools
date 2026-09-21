"use client";

import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { IntroContentEditor } from "~/components/zine/intro-content-editor";
import { ZinePageRecommendationsEditor } from "~/components/zine/zine-page-recommendations-editor";
import { ZineRecommendationAlbumPickerDrawer } from "~/components/zine/zine-recommendation-album-picker-drawer";
import { cn } from "~/lib/utils";
import type { ZinePageRecommendation } from "~/lib/zine/zine-page-recommendations";
import {
	formatTrackDurationInput,
	parseTrackDurationInput,
} from "~/lib/zine/zine-song-header-content";
import { type ZineCreditRow, ZineCreditsDrawer } from "./zine-credits-drawer";
import { ZineField } from "./zine-field";
import { type ZineScrapeDetail, ZineScrapeDrawer } from "./zine-scrape-drawer";

export type ZineTrackRowFields = {
	title: string;
	artist: string;
	album: string;
	durationInput: string;
	albumArtUrl: string;
	intro: string;
	note: string;
};

export type ZineTrackRowStatus =
	| "ready"
	| "failed"
	| "manual"
	| "scraping"
	| "reused"
	| "none";

export function ZineTrackRow({
	id,
	trackNumber,
	displayTitle,
	displayArtist,
	displayDuration,
	status,
	expanded,
	onToggle,
	onVisible,
	fields,
	onFieldChange,
	placeholders,
	showArtistAlbumArt,
	showNote,
	credits,
	hiddenCreditLabels,
	onCreditVisibilityChange,
	scrapeDetails,
	scrapeEmptyMessage,
	onRescrape,
	rescraping,
	onDelete,
	deleting,
	canRescrape,
	recommendations,
	onRecommendationsChange,
	recommendationsUserId,
}: {
	id: string;
	trackNumber: number;
	displayTitle: string;
	displayArtist: string;
	displayDuration: string;
	status: ZineTrackRowStatus;
	expanded: boolean;
	onToggle: () => void;
	onVisible?: (visible: boolean) => void;
	fields: ZineTrackRowFields;
	onFieldChange: <K extends keyof ZineTrackRowFields>(
		field: K,
		value: ZineTrackRowFields[K],
	) => void;
	placeholders: {
		title?: string;
		artist?: string;
		album?: string;
		albumArtUrl?: string;
		intro?: string;
	};
	showArtistAlbumArt: boolean;
	showNote: boolean;
	credits: ZineCreditRow[];
	hiddenCreditLabels: string[];
	onCreditVisibilityChange: (label: string, visible: boolean) => void;
	scrapeDetails: ZineScrapeDetail[];
	scrapeEmptyMessage?: string;
	onRescrape?: () => void;
	rescraping?: boolean;
	onDelete?: () => void;
	deleting?: boolean;
	canRescrape?: boolean;
	recommendations?: ZinePageRecommendation[];
	onRecommendationsChange?: (items: ZinePageRecommendation[]) => void;
	recommendationsUserId?: string;
}): ReactNode {
	const rowRef = useRef<HTMLDivElement>(null);
	const [creditsOpen, setCreditsOpen] = useState(false);
	const [scrapeOpen, setScrapeOpen] = useState(false);
	const [albumArtPickerOpen, setAlbumArtPickerOpen] = useState(false);
	const [durationError, setDurationError] = useState<string | null>(null);

	useEffect(() => {
		if (!onVisible || !rowRef.current) return;

		const observer = new IntersectionObserver(
			([entry]) => {
				onVisible(entry?.isIntersecting === true);
			},
			{ rootMargin: "-15% 0px -55% 0px", threshold: 0 },
		);
		observer.observe(rowRef.current);
		return () => observer.disconnect();
	}, [onVisible]);

	const trackLabel = `${String(trackNumber).padStart(2, "0")}  ${displayTitle}`;

	function handleDurationBlur(): void {
		const trimmed = fields.durationInput.trim();
		if (!trimmed) {
			setDurationError(null);
			onFieldChange("durationInput", "");
			return;
		}
		try {
			const parsed = parseTrackDurationInput(trimmed);
			setDurationError(null);
			onFieldChange(
				"durationInput",
				formatTrackDurationInput(parsed ?? undefined),
			);
		} catch (error) {
			setDurationError(
				error instanceof Error ? error.message : "Invalid duration",
			);
		}
	}

	return (
		<div
			ref={rowRef}
			id={id}
			className={cn(
				"scroll-mt-32 border-border/40 border-b",
				expanded && "bg-muted/20",
			)}
		>
			<button
				type="button"
				onClick={onToggle}
				aria-expanded={expanded}
				className={cn(
					"grid w-full grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 px-1 py-3 text-left transition-colors",
					"hover:bg-muted/30 focus-visible:bg-muted/40 focus-visible:outline-none",
					"sm:grid-cols-[2.5rem_minmax(0,1.4fr)_minmax(0,1fr)_4.5rem_auto]",
				)}
			>
				<span className="font-medium text-muted-foreground text-sm tabular-nums">
					{String(trackNumber).padStart(2, "0")}
				</span>
				<span className="min-w-0 truncate font-medium text-sm">
					{displayTitle}
				</span>
				<span className="hidden min-w-0 truncate text-muted-foreground text-sm sm:block">
					{displayArtist}
				</span>
				<span className="hidden text-muted-foreground text-sm tabular-nums sm:block">
					{displayDuration || "—"}
				</span>
				<span className="justify-self-end">
					<StatusChip status={status} />
				</span>
			</button>

			{expanded ? (
				<div className="space-y-5 border-border/30 border-t px-1 pt-4 pb-6">
					<div className="grid gap-4 sm:grid-cols-2">
						<ZineField
							label="Title"
							htmlFor={`${id}-title`}
							placement="Song header."
						>
							<Input
								id={`${id}-title`}
								value={fields.title}
								placeholder={placeholders.title}
								onChange={(event) =>
									onFieldChange("title", event.currentTarget.value)
								}
							/>
						</ZineField>
						{showArtistAlbumArt ? (
							<ZineField
								label="Artist"
								htmlFor={`${id}-artist`}
								placement="Song header credit line."
							>
								<Input
									id={`${id}-artist`}
									value={fields.artist}
									placeholder={placeholders.artist}
									onChange={(event) =>
										onFieldChange("artist", event.currentTarget.value)
									}
								/>
							</ZineField>
						) : null}
						{showArtistAlbumArt ? (
							<ZineField
								label="Album"
								htmlFor={`${id}-album`}
								placement="Song header, italic."
							>
								<Input
									id={`${id}-album`}
									value={fields.album}
									placeholder={placeholders.album}
									onChange={(event) =>
										onFieldChange("album", event.currentTarget.value)
									}
								/>
							</ZineField>
						) : null}
						<ZineField
							label="Duration"
							htmlFor={`${id}-duration`}
							placement="Song header, as m:ss. Leave empty for auto."
						>
							<Input
								id={`${id}-duration`}
								value={fields.durationInput}
								placeholder="3:15"
								onChange={(event) => {
									setDurationError(null);
									onFieldChange("durationInput", event.currentTarget.value);
								}}
								onBlur={handleDurationBlur}
							/>
							{durationError ? (
								<p className="text-destructive text-xs">{durationError}</p>
							) : null}
						</ZineField>
						{showArtistAlbumArt ? (
							<ZineField
								label="Album art URL"
								htmlFor={`${id}-art`}
								placement="Song header art."
								className="sm:col-span-2"
							>
								<div className="flex items-end gap-2">
									<Input
										id={`${id}-art`}
										type="url"
										value={fields.albumArtUrl}
										placeholder={placeholders.albumArtUrl}
										className="min-w-0 flex-1"
										onChange={(event) =>
											onFieldChange("albumArtUrl", event.currentTarget.value)
										}
									/>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => setAlbumArtPickerOpen(true)}
									>
										<Search className="mr-2 h-4 w-4" />
										Search
									</Button>
								</div>
								{(fields.albumArtUrl.trim() || placeholders.albumArtUrl) && (
									<img
										src={
											fields.albumArtUrl.trim() ||
											placeholders.albumArtUrl ||
											""
										}
										alt=""
										className="mt-2 h-14 w-14 rounded-sm object-cover"
									/>
								)}
								<ZineRecommendationAlbumPickerDrawer
									open={albumArtPickerOpen}
									onOpenChange={setAlbumArtPickerOpen}
									userId={recommendationsUserId}
									initialSearch={
										fields.album.trim() ||
										fields.artist.trim() ||
										placeholders.album ||
										placeholders.artist ||
										displayTitle
									}
									onSelect={(selection) => {
										if (!selection.imageUrl?.trim()) {
											toast.error("That album has no cover image.");
											return;
										}
										onFieldChange("albumArtUrl", selection.imageUrl);
									}}
								/>
							</ZineField>
						) : null}
					</div>

					<IntroContentEditor
						id={`${id}-intro`}
						value={fields.intro}
						label="Intro"
						placeholder={
							placeholders.intro ?? "Optional intro for the INTRO section"
						}
						helperText="INTRO block on this song’s page. Use *bold*, _italic_, and blank lines for paragraphs."
						onChange={(next) => onFieldChange("intro", next)}
					/>

					{showNote ? (
						<ZineField
							label="Song note"
							htmlFor={`${id}-note`}
							placement="Under the song header. Hidden on the public zine."
						>
							<Textarea
								id={`${id}-note`}
								value={fields.note}
								placeholder="Optional note for this song"
								className="min-h-20"
								onChange={(event) =>
									onFieldChange("note", event.currentTarget.value)
								}
							/>
						</ZineField>
					) : null}

					{recommendations !== undefined && onRecommendationsChange ? (
						<div className="space-y-2 border-border/60 border-t pt-4">
							<div>
								<p className="font-medium text-sm text-teal-950">
									Lyric-page recommendations
								</p>
								<p className="text-muted-foreground text-xs">
									Up to four albums above the credits on this track’s lyric
									page.
								</p>
							</div>
							<ZinePageRecommendationsEditor
								items={recommendations}
								onChange={onRecommendationsChange}
								userId={recommendationsUserId}
							/>
						</div>
					) : null}

					<div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
						{credits.length > 0 ? (
							<button
								type="button"
								className="text-teal-800 underline-offset-4 hover:underline"
								onClick={() => setCreditsOpen(true)}
							>
								Credits
							</button>
						) : null}
						<button
							type="button"
							className="text-teal-800 underline-offset-4 hover:underline"
							onClick={() => setScrapeOpen(true)}
						>
							Scrape details
						</button>
						{canRescrape && onRescrape ? (
							<button
								type="button"
								className="text-teal-800 underline-offset-4 hover:underline disabled:opacity-50"
								disabled={rescraping}
								onClick={onRescrape}
							>
								{rescraping ? "Rescraping…" : "Rescrape"}
							</button>
						) : null}
						{onDelete ? (
							<button
								type="button"
								className="text-destructive underline-offset-4 hover:underline disabled:opacity-50"
								disabled={deleting}
								onClick={onDelete}
							>
								{deleting ? "Deleting…" : "Delete"}
							</button>
						) : null}
					</div>
				</div>
			) : null}

			<ZineCreditsDrawer
				open={creditsOpen}
				onOpenChange={setCreditsOpen}
				trackLabel={trackLabel}
				credits={credits}
				hiddenCreditLabels={hiddenCreditLabels}
				onVisibilityChange={onCreditVisibilityChange}
			/>
			<ZineScrapeDrawer
				open={scrapeOpen}
				onOpenChange={setScrapeOpen}
				trackLabel={trackLabel}
				details={scrapeDetails}
				emptyMessage={scrapeEmptyMessage}
			/>
		</div>
	);
}

function StatusChip({ status }: { status: ZineTrackRowStatus }): ReactNode {
	if (status === "none") return null;

	const label =
		status === "ready"
			? "ready"
			: status === "failed"
				? "failed"
				: status === "manual"
					? "manual"
					: status === "scraping"
						? "scraping"
						: "reused";

	return (
		<span
			className={cn(
				"rounded-full px-2 py-0.5 font-medium text-[0.65rem] uppercase tracking-[0.06em]",
				status === "failed"
					? "bg-destructive/10 text-destructive"
					: status === "manual"
						? "bg-muted text-muted-foreground"
						: "bg-teal-950/[0.06] text-teal-800",
			)}
		>
			{label}
		</span>
	);
}
