"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Fragment, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import { Slider } from "~/components/ui/slider";
import { cn } from "~/lib/utils";
import { buildBookletSheets } from "~/lib/zine/zine-booklet";
import {
	ZINE_LYRICS_SIZE_SLIDER,
	ZINE_TEXT_CONDENSE,
} from "~/lib/zine/zine-layout";
import { buildZinePages } from "~/lib/zine/zine-pages";
import type {
	ZineBackCoverQrCodes,
	ZineItemSettings,
	ZineSongDisplayInput,
} from "~/lib/zine/zine-types";
import { ZineCoverPage } from "./zine-cover-page";
import { triggerZinePrintRemeasure } from "./zine-print-remeasure";
import { ZinePrintStyles } from "./zine-print-styles";
import {
	type ZineDisplayOptions,
	type ZineLyricsColumnMode,
	ZineSongPage,
} from "./zine-song-page";

export type LyricsZinePersistence = {
	saveItemSettings(songId: string, settings: ZineItemSettings): void;
	saveCover(
		url: string | undefined,
		storageId?: string,
	): Promise<{ coverImageUrl?: string }>;
	saveGreyscale(on: boolean): void;
	generateUploadUrl(): Promise<string>;
};

type ZineDuplexBinding = "long-edge" | "short-edge";

export function LyricsZine({
	collectionTitle,
	backHref,
	songs,
	cover,
	backCoverQrCodes,
	itemSettingsById,
	canEdit,
	persistence,
}: {
	collectionTitle: string;
	backHref: string;
	songs: ZineSongDisplayInput[];
	cover: { imageUrl?: string; greyscale: boolean };
	backCoverQrCodes?: ZineBackCoverQrCodes;
	itemSettingsById: Record<string, ZineItemSettings>;
	canEdit: boolean;
	persistence?: LyricsZinePersistence;
}) {
	const [duplexBinding, setDuplexBinding] =
		useState<ZineDuplexBinding>("short-edge");
	const [showGeniusInfo, setShowGeniusInfo] = useState(false);
	const [showArtist, setShowArtist] = useState(true);
	const [showAlbum, setShowAlbum] = useState(true);
	const [showYear, setShowYear] = useState(true);
	const [showAlbumArt, setShowAlbumArt] = useState(true);
	const [showSectionLabels, setShowSectionLabels] = useState(false);
	const [showIntro, setShowIntro] = useState(true);
	const [showUserNote, setShowUserNote] = useState(true);
	const [songLyricsColumnModes, setSongLyricsColumnModes] = useState<
		Record<string, 1>
	>(() => {
		const columns: Record<string, 1> = {};
		for (const [id, settings] of Object.entries(itemSettingsById)) {
			if (settings.columnCount === 1) {
				columns[id] = 1;
			}
		}
		return columns;
	});
	const [songLyricsTargetSizesPt, setSongLyricsTargetSizesPt] = useState<
		Record<string, number>
	>(() => {
		const sizes: Record<string, number> = {};
		for (const [id, settings] of Object.entries(itemSettingsById)) {
			const pt = settings.fontSizePt;
			if (
				pt !== undefined &&
				pt !== ZINE_LYRICS_SIZE_SLIDER.defaultPt &&
				pt >= ZINE_LYRICS_SIZE_SLIDER.minPt &&
				pt <= ZINE_LYRICS_SIZE_SLIDER.maxPt
			) {
				sizes[id] = pt;
			}
		}
		return sizes;
	});
	const [songTextCondenseScales, setSongTextCondenseScales] = useState<
		Record<string, number>
	>(() => {
		const condense: Record<string, number> = {};
		for (const [id, settings] of Object.entries(itemSettingsById)) {
			const condenseScale = settings.condenseScale;
			if (
				condenseScale !== undefined &&
				condenseScale !== ZINE_TEXT_CONDENSE.default &&
				condenseScale >= ZINE_TEXT_CONDENSE.min &&
				condenseScale <= ZINE_TEXT_CONDENSE.max
			) {
				condense[id] = clampCondenseScale(condenseScale);
			}
		}
		return condense;
	});
	const [songCreditsHidden, setSongCreditsHidden] = useState<
		Record<string, true>
	>(() => {
		const hidden: Record<string, true> = {};
		for (const [id, settings] of Object.entries(itemSettingsById)) {
			if (settings.showCredits === false) {
				hidden[id] = true;
			}
		}
		return hidden;
	});
	const [coverImageUrl, setCoverImageUrl] = useState(cover.imageUrl ?? "");
	const [coverGreyscale, setCoverGreyscale] = useState(cover.greyscale);
	const [isUploadingCover, setIsUploadingCover] = useState(false);

	const persistZineTimersRef = useRef<Map<string, number>>(new Map());
	const persistCoverImageTimerRef = useRef<number | undefined>(undefined);
	const coverFileInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		return () => {
			for (const timer of persistZineTimersRef.current.values()) {
				clearTimeout(timer);
			}
			persistZineTimersRef.current.clear();
			if (persistCoverImageTimerRef.current !== undefined) {
				clearTimeout(persistCoverImageTimerRef.current);
			}
		};
	}, []);

	const displayOptions: ZineDisplayOptions = {
		showArtist,
		showAlbum,
		showYear,
		showAlbumArt,
		showIntro,
		showGeniusInfo,
		showSectionLabels,
		showUserNote: canEdit && showUserNote,
	};

	const resolvedCoverImageUrl = coverImageUrl.trim() || undefined;
	const resolvedCoverGreyscale =
		coverGreyscale && Boolean(resolvedCoverImageUrl);

	const pages = buildZinePages({
		playlistTitle: collectionTitle,
		songs,
	});
	const bookletSheets = buildBookletSheets(pages);

	function getZineSettingsSnapshot(songId: string): ZineItemSettings {
		return {
			columnCount: songId in songLyricsColumnModes ? 1 : 2,
			fontSizePt: getLyricsTargetPtForSong(songLyricsTargetSizesPt, songId),
			condenseScale: getCondenseScaleForSong(songTextCondenseScales, songId),
			showCredits: !(songId in songCreditsHidden),
		};
	}

	function queueDebouncedPersistZineItemSettings(
		songId: string,
		settings: ZineItemSettings,
	): void {
		const persist = persistence;
		if (!persist) return;

		const existing = persistZineTimersRef.current.get(songId);
		if (existing !== undefined) {
			clearTimeout(existing);
		}

		const timeoutId = window.setTimeout(() => {
			persistZineTimersRef.current.delete(songId);
			const roundedPt =
				settings.fontSizePt !== undefined
					? Math.round(settings.fontSizePt * 2) / 2
					: ZINE_LYRICS_SIZE_SLIDER.defaultPt;
			const roundedCondense = clampCondenseScale(
				settings.condenseScale ?? ZINE_TEXT_CONDENSE.default,
			);
			persist.saveItemSettings(songId, {
				columnCount: settings.columnCount,
				fontSizePt: roundedPt,
				condenseScale: roundedCondense,
				showCredits: settings.showCredits,
			});
		}, 500);

		persistZineTimersRef.current.set(songId, timeoutId);
	}

	function queueDebouncedPersistCoverImage(nextUrl: string): void {
		const persist = persistence;
		if (!persist) return;

		if (persistCoverImageTimerRef.current !== undefined) {
			clearTimeout(persistCoverImageTimerRef.current);
		}

		persistCoverImageTimerRef.current = window.setTimeout(() => {
			persistCoverImageTimerRef.current = undefined;
			const trimmed = nextUrl.trim();
			void persist
				.saveCover(trimmed.length > 0 ? trimmed : "")
				.then((result) => {
					setCoverImageUrl(result.coverImageUrl ?? "");
				});
		}, 500);
	}

	async function handleCoverFileUpload(file: File | undefined) {
		const persist = persistence;
		if (file === undefined || !persist) {
			return;
		}

		if (!file.type.startsWith("image/")) {
			toast.error("Please choose an image file");
			return;
		}

		if (file.size > 15 * 1024 * 1024) {
			toast.error("Image must be under 15 MB");
			return;
		}

		setIsUploadingCover(true);
		try {
			const uploadUrl = await persist.generateUploadUrl();
			const response = await fetch(uploadUrl, {
				method: "POST",
				headers: { "Content-Type": file.type },
				body: file,
			});

			if (!response.ok) {
				throw new Error("Upload failed");
			}

			const { storageId } = (await response.json()) as {
				storageId: string;
			};

			const result = await persist.saveCover(undefined, storageId);
			setCoverImageUrl(result.coverImageUrl ?? "");
			toast.success("Cover image uploaded");
		} catch {
			toast.error("Failed to upload cover image");
		} finally {
			setIsUploadingCover(false);
			if (coverFileInputRef.current) {
				coverFileInputRef.current.value = "";
			}
		}
	}

	function handlePrint() {
		triggerZinePrintRemeasure();
		window.setTimeout(() => {
			window.print();
		}, 150);
	}

	function renderPageByReadingIndex(
		pageIndex: number,
		keyPrefix: string,
		options?: { useSheetSpreadBackground?: boolean },
	): ReactNode {
		const page = pages[pageIndex];
		if (page === undefined) return null;

		if (page.kind === "cover") {
			return (
				<ZineCoverPage
					key={`${keyPrefix}-cover`}
					coverGreyscale={resolvedCoverGreyscale}
					coverImageUrl={resolvedCoverImageUrl}
					coverSide="front"
					playlistTitle={page.playlistTitle}
					useSheetSpreadBackground={options?.useSheetSpreadBackground}
				/>
			);
		}

		if (page.kind === "song") {
			const lyricsColumnMode: ZineLyricsColumnMode =
				page.songId in songLyricsColumnModes ? 1 : 2;
			const lyricsTargetFontSizePt = getLyricsTargetPtForSong(
				songLyricsTargetSizesPt,
				page.songId,
			);
			const titleCondenseScale = getCondenseScaleForSong(
				songTextCondenseScales,
				page.songId,
			);
			const showCredits = !(page.songId in songCreditsHidden);
			return (
				<ZineSongPage
					key={`${keyPrefix}-song-${page.songId}`}
					displayOptions={displayOptions}
					lyricsColumnMode={lyricsColumnMode}
					lyricsTargetFontSizePt={lyricsTargetFontSizePt}
					showCredits={showCredits}
					song={{
						songId: page.songId,
						position: page.position,
						title: page.title,
						artistName: page.artistName,
						albumTitle: page.albumTitle,
						albumYear: page.albumYear,
						albumArtUrl: page.albumArtUrl,
						durationSeconds: page.durationSeconds,
						userNote: page.userNote,
						introContent: page.introContent,
						about: page.about,
						lyrics: page.lyrics,
					}}
					titleCondenseScale={titleCondenseScale}
				/>
			);
		}

		if (page.kind === "back-cover") {
			return (
				<ZineCoverPage
					key={`${keyPrefix}-back`}
					backCoverQrCodes={backCoverQrCodes}
					coverGreyscale={resolvedCoverGreyscale}
					coverImageUrl={resolvedCoverImageUrl}
					coverSide="back"
					playlistTitle={collectionTitle}
					useSheetSpreadBackground={options?.useSheetSpreadBackground}
				/>
			);
		}

		if (page.kind === "blank") {
			return (
				<section
					key={`${keyPrefix}-blank-${pageIndex}`}
					className="zine-page zine-page-preview"
					aria-hidden="true"
				/>
			);
		}

		return null;
	}

	return (
		<>
			<ZinePrintStyles />
			<div className="zine-layout-shell mx-auto max-w-4xl px-4 pt-6 pb-10">
				<div className="no-print mb-6">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<Button asChild variant="ghost" className="self-start">
							<Link href={backHref}>
								<ArrowLeft className="mr-2 h-4 w-4" />
								Back to Reader
							</Link>
						</Button>
						<div className="flex flex-wrap gap-2">
							<Button onClick={handlePrint}>
								<Printer className="mr-2 h-4 w-4" />
								Print Zine
							</Button>
						</div>
					</div>

					<fieldset className="no-print mt-3 space-y-2 rounded-lg border bg-card px-4 py-3 shadow-sm">
						<legend className="font-medium text-sm">
							Two‑sided print (Letter landscape booklet)
						</legend>
						<p className="text-muted-foreground text-xs leading-snug">
							Default matches typical macOS duplex for landscape:{" "}
							<strong className="font-medium text-foreground">
								Flip on short edge
							</strong>
							. If backs still print upside down, switch to Flip on{" "}
							<strong className="font-medium text-foreground">long edge</strong>{" "}
							below—we rotate booklet backs so that option aligns.
						</p>
						<div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
							<ZineDuplexBindingOptionRow
								checked={duplexBinding === "short-edge"}
								groupName="zine-booklet-duplex-binding"
								id="zine-booklet-duplex-short-edge"
								label={
									<>
										<strong className="font-medium text-foreground">
											Flip on short edge
										</strong>{" "}
										(recommended · default)
									</>
								}
								onSelect={() => setDuplexBinding("short-edge")}
							/>
							<ZineDuplexBindingOptionRow
								checked={duplexBinding === "long-edge"}
								groupName="zine-booklet-duplex-binding"
								id="zine-booklet-duplex-long-edge"
								label={
									<>
										<strong className="font-medium text-foreground">
											Flip on long edge
										</strong>{" "}
										(layout rotates booklet backs ~180° for this setting)
									</>
								}
								onSelect={() => setDuplexBinding("long-edge")}
							/>
						</div>
					</fieldset>

					{canEdit ? (
						<div className="no-print mt-4 rounded-lg border bg-card p-4 shadow-sm">
							<p className="mb-1 font-medium text-sm">Cover image</p>
							<p className="mb-3 text-muted-foreground text-xs leading-snug">
								One wide image spans the front and back cover on the outer sheet
								(left = back, right = front). The playlist title sits on the
								front cover only, with a translucent white background.
							</p>
							<div className="space-y-3">
								<div className="space-y-2">
									<Label htmlFor="zine-cover-image-url" className="text-sm">
										Image URL
									</Label>
									<Input
										id="zine-cover-image-url"
										disabled={isUploadingCover}
										onChange={(event) => {
											const next = event.target.value;
											setCoverImageUrl(next);
											queueDebouncedPersistCoverImage(next);
										}}
										placeholder="https://…"
										type="url"
										value={coverImageUrl}
									/>
								</div>
								<p className="text-center text-muted-foreground text-xs">or</p>
								<div className="space-y-2">
									<Label htmlFor="zine-cover-image-file" className="text-sm">
										Upload image
									</Label>
									<input
										ref={coverFileInputRef}
										accept="image/jpeg,image/png,image/webp,image/gif"
										className="sr-only"
										id="zine-cover-image-file"
										onChange={(event) => {
											const file = event.target.files?.[0];
											void handleCoverFileUpload(file);
										}}
										type="file"
									/>
									<Button
										disabled={isUploadingCover}
										onClick={() => coverFileInputRef.current?.click()}
										type="button"
										variant="outline"
									>
										{isUploadingCover ? "Uploading…" : "Choose file"}
									</Button>
									<p className="text-muted-foreground text-xs">
										JPEG, PNG, WebP, or GIF · max 15 MB · 3300×2550 px
										recommended
									</p>
								</div>
								<ZineToggleControl
									checked={coverGreyscale}
									disabled={!resolvedCoverImageUrl || isUploadingCover}
									id="zine-cover-greyscale"
									label="Greyscale cover image"
									onCheckedChange={(checked) => {
										setCoverGreyscale(checked);
										persistence?.saveGreyscale(checked);
									}}
								/>
							</div>
						</div>
					) : null}

					<div className="no-print mt-4 rounded-lg border bg-card p-4 shadow-sm">
						<p className="mb-3 font-medium text-sm">Display options</p>
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							<ZineToggleControl
								id="zine-show-artist"
								checked={showArtist}
								onCheckedChange={setShowArtist}
								label="Show artist"
							/>
							<ZineToggleControl
								id="zine-show-album"
								checked={showAlbum}
								onCheckedChange={setShowAlbum}
								label="Show album"
							/>
							<ZineToggleControl
								id="zine-show-year"
								checked={showYear}
								onCheckedChange={setShowYear}
								label="Show year"
							/>
							<ZineToggleControl
								id="zine-show-album-art"
								checked={showAlbumArt}
								onCheckedChange={setShowAlbumArt}
								label="Show album art"
							/>
							<ZineToggleControl
								id="zine-show-intro"
								checked={showIntro}
								onCheckedChange={setShowIntro}
								label="Show intro"
							/>
							<ZineToggleControl
								id="zine-genius-info"
								checked={showGeniusInfo}
								onCheckedChange={setShowGeniusInfo}
								label="Show Genius info"
							/>
							<ZineToggleControl
								id="zine-show-section-labels"
								checked={showSectionLabels}
								onCheckedChange={setShowSectionLabels}
								label="Show song part labels"
							/>
							{canEdit ? (
								<ZineToggleControl
									id="zine-show-user-note"
									checked={showUserNote}
									onCheckedChange={setShowUserNote}
									label="Show notes"
								/>
							) : null}
						</div>
					</div>

					<p className="mt-4 text-muted-foreground text-sm">
						{canEdit ? (
							<>
								Editing is reading order ({pages.length} half-letter portrait
								pages at 5.5×8.5&nbsp;in, padded to a booklet multiple of 4).
								Per track, tune 1 or 2 lyrics columns (default 2), lyrics size
								({ZINE_LYRICS_SIZE_SLIDER.minPt}–
								{ZINE_LYRICS_SIZE_SLIDER.maxPt}
								pt, default {ZINE_LYRICS_SIZE_SLIDER.defaultPt} pt), and title
								width ({Math.round(ZINE_TEXT_CONDENSE.min * 100)}–
								{Math.round(ZINE_TEXT_CONDENSE.max * 100)}
								%, default {Math.round(ZINE_TEXT_CONDENSE.default * 100)}%)—controls
								sit to the right of each page in preview. Printing emits
							</>
						) : (
							<>
								Reading order ({pages.length} half-letter portrait pages at
								5.5×8.5&nbsp;in, padded to a booklet multiple of 4). Use display
								options above to show or hide fields before printing. Printing
								emits
							</>
						)}{" "}
						saddle-stitched
						<strong className="font-medium text-foreground">
							{" "}
							Letter‑landscape
						</strong>{" "}
						sheets (logical page{" "}
						<strong className="font-medium text-foreground">
							11×8.5&nbsp;in
						</strong>
						, two{" "}
						<strong className="font-medium text-foreground">
							5.5×8.5&nbsp;in
						</strong>{" "}
						panels) so you keep{" "}
						<strong className="font-medium text-foreground">
							scale at 100%
						</strong>
						—set margins to None if the dialog allows, print two‑sided using the
						flip option chosen above ({" "}
						<strong className="font-medium text-foreground">short edge</strong>{" "}
						matches most Letter‑landscape home printers; use{" "}
						<strong className="font-medium text-foreground">long edge</strong>{" "}
						plus the matching UI option if backs would otherwise print
						upside‑down). No booklet layout mode in Preview.
					</p>
				</div>

				<div
					className="zine-print-booklet-root zine-document"
					data-zine-duplex-binding={duplexBinding}
					aria-hidden="true"
				>
					{bookletSheets.map((sheet, sheetIndex) => (
						<Fragment key={`booklet-sheet-${sheetIndex}`}>
							<section
								className={cn(
									"zine-booklet-sheet",
									resolvedCoverImageUrl &&
										sheetIndex === 0 &&
										"zine-booklet-cover-spread",
									resolvedCoverGreyscale &&
										sheetIndex === 0 &&
										"zine-cover-greyscale",
								)}
								data-booklet-sheet-side="front"
								style={
									resolvedCoverImageUrl && sheetIndex === 0
										? {
												backgroundImage: `url("${resolvedCoverImageUrl}")`,
											}
										: undefined
								}
							>
								<div className="zine-booklet-panel">
									{renderPageByReadingIndex(
										sheet.front.leftIndex,
										`b${sheetIndex}-ff-l`,
										{
											useSheetSpreadBackground:
												Boolean(resolvedCoverImageUrl) && sheetIndex === 0,
										},
									)}
								</div>
								<div className="zine-booklet-panel">
									{renderPageByReadingIndex(
										sheet.front.rightIndex,
										`b${sheetIndex}-ff-r`,
										{
											useSheetSpreadBackground:
												Boolean(resolvedCoverImageUrl) && sheetIndex === 0,
										},
									)}
								</div>
							</section>
							<section
								className="zine-booklet-sheet"
								data-booklet-sheet-side="back"
							>
								<div className="zine-booklet-panel">
									{renderPageByReadingIndex(
										sheet.back.leftIndex,
										`b${sheetIndex}-fb-l`,
									)}
								</div>
								<div className="zine-booklet-panel">
									{renderPageByReadingIndex(
										sheet.back.rightIndex,
										`b${sheetIndex}-fb-r`,
									)}
								</div>
							</section>
						</Fragment>
					))}
				</div>

				<div className="zine-screen-document zine-document">
					{pages.map((page, index) => {
						if (page.kind === "song") {
							const lyricsColumnMode: ZineLyricsColumnMode =
								page.songId in songLyricsColumnModes ? 1 : 2;
							const lyricsTargetFontSizePt = getLyricsTargetPtForSong(
								songLyricsTargetSizesPt,
								page.songId,
							);
							const titleCondenseScale = getCondenseScaleForSong(
								songTextCondenseScales,
								page.songId,
							);
							const showCredits = !(page.songId in songCreditsHidden);
							return (
								<div
									key={page.songId}
									className={cn(canEdit && "zine-song-preview-shell")}
								>
									{canEdit ? (
										<>
											<div className="flex shrink-0 justify-start">
												{renderPageByReadingIndex(index, `scr-${index}`)}
											</div>
											<aside className="no-print zine-song-columns-panel rounded-lg border bg-card px-3 py-3 shadow-sm">
												<ZineTrackLyricsColumnControls
													condenseScale={titleCondenseScale}
													lyricsSizePt={lyricsTargetFontSizePt}
													mode={lyricsColumnMode}
													showCredits={showCredits}
													onShowCreditsChange={(nextShowCredits) => {
														setSongCreditsHidden((previous) =>
															setSongCreditsVisible(
																previous,
																page.songId,
																nextShowCredits,
															),
														);
														queueDebouncedPersistZineItemSettings(
															page.songId,
															{
																...getZineSettingsSnapshot(page.songId),
																showCredits: nextShowCredits,
															},
														);
													}}
													onCondenseScaleChange={(nextScale) => {
														setSongTextCondenseScales((previous) =>
															setSongCondenseScale(
																previous,
																page.songId,
																nextScale,
															),
														);
														queueDebouncedPersistZineItemSettings(
															page.songId,
															{
																...getZineSettingsSnapshot(page.songId),
																condenseScale: clampCondenseScale(nextScale),
															},
														);
													}}
													onLyricsSizePtChange={(nextPt) => {
														setSongLyricsTargetSizesPt((previous) =>
															setSongLyricsTargetPt(
																previous,
																page.songId,
																nextPt,
															),
														);
														const roundedHalf = Math.round(nextPt * 2) / 2;
														const resolvedPt =
															roundedHalf ===
															ZINE_LYRICS_SIZE_SLIDER.defaultPt
																? ZINE_LYRICS_SIZE_SLIDER.defaultPt
																: roundedHalf;
														queueDebouncedPersistZineItemSettings(
															page.songId,
															{
																...getZineSettingsSnapshot(page.songId),
																fontSizePt: resolvedPt,
															},
														);
													}}
													onModeChange={(mode) => {
														setSongLyricsColumnModes((previous) =>
															removeOrSetLyricsColumnMode(
																previous,
																page.songId,
																mode,
															),
														);
														queueDebouncedPersistZineItemSettings(
															page.songId,
															{
																...getZineSettingsSnapshot(page.songId),
																columnCount: mode,
															},
														);
													}}
													songId={page.songId}
													songTitle={page.title}
													trackNumber={page.position}
												/>
											</aside>
										</>
									) : (
										renderPageByReadingIndex(index, `scr-${index}`)
									)}
								</div>
							);
						}

						return renderPageByReadingIndex(index, `scr-${index}`);
					})}
				</div>
			</div>
		</>
	);
}

export function LyricsZineSkeleton() {
	return (
		<div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
			<Skeleton className="h-10 w-48" />
			<Skeleton className="mx-auto h-[8.5in] w-[5.5in]" />
		</div>
	);
}

function getLyricsTargetPtForSong(
	overrides: Record<string, number>,
	songId: string,
): number {
	return overrides[songId] ?? ZINE_LYRICS_SIZE_SLIDER.defaultPt;
}

function getCondenseScaleForSong(
	overrides: Record<string, number>,
	songId: string,
): number {
	return overrides[songId] ?? ZINE_TEXT_CONDENSE.default;
}

function setSongLyricsTargetPt(
	previous: Record<string, number>,
	songId: string,
	nextPt: number,
): Record<string, number> {
	const roundedHalf = Math.round(nextPt * 2) / 2;
	if (roundedHalf === ZINE_LYRICS_SIZE_SLIDER.defaultPt) {
		if (!(songId in previous)) {
			return previous;
		}
		const next = { ...previous };
		delete next[songId];
		return next;
	}

	if (previous[songId] === roundedHalf) {
		return previous;
	}

	return { ...previous, [songId]: roundedHalf };
}

function clampCondenseScale(scale: number): number {
	const stepped =
		Math.round(scale / ZINE_TEXT_CONDENSE.step) * ZINE_TEXT_CONDENSE.step;
	const clamped = Math.min(
		ZINE_TEXT_CONDENSE.max,
		Math.max(ZINE_TEXT_CONDENSE.min, stepped),
	);
	return Math.round(clamped * 100) / 100;
}

function setSongCondenseScale(
	previous: Record<string, number>,
	songId: string,
	nextScale: number,
): Record<string, number> {
	const next = clampCondenseScale(nextScale);
	if (next === ZINE_TEXT_CONDENSE.default) {
		if (!(songId in previous)) {
			return previous;
		}
		const copy = { ...previous };
		delete copy[songId];
		return copy;
	}

	if (previous[songId] === next) {
		return previous;
	}

	return { ...previous, [songId]: next };
}

function formatZineLyricsSizePt(pt: number): string {
	const roundedHalf = Math.round(pt * 2) / 2;
	if (Number.isInteger(roundedHalf)) {
		return `${roundedHalf}pt`;
	}
	return `${roundedHalf.toFixed(1)}pt`;
}

function formatCondensePercent(scale: number): string {
	const roundedPct = Math.round(scale * 100);
	return `${roundedPct}%`;
}

function removeOrSetLyricsColumnMode(
	previous: Record<string, 1>,
	songId: string,
	mode: ZineLyricsColumnMode,
): Record<string, 1> {
	if (mode === 2) {
		if (!(songId in previous)) {
			return previous;
		}
		const next = { ...previous };
		delete next[songId];
		return next;
	}

	if (previous[songId] === 1) {
		return previous;
	}

	return { ...previous, [songId]: 1 };
}

function setSongCreditsVisible(
	previous: Record<string, true>,
	songId: string,
	visible: boolean,
): Record<string, true> {
	if (visible) {
		if (!(songId in previous)) {
			return previous;
		}
		const next = { ...previous };
		delete next[songId];
		return next;
	}

	if (previous[songId] === true) {
		return previous;
	}

	return { ...previous, [songId]: true };
}

function ZineTrackLyricsColumnControls({
	songTitle,
	mode,
	onModeChange,
	songId,
	trackNumber,
	lyricsSizePt,
	onLyricsSizePtChange,
	condenseScale,
	onCondenseScaleChange,
	showCredits,
	onShowCreditsChange,
}: {
	mode: ZineLyricsColumnMode;
	onModeChange: (mode: ZineLyricsColumnMode) => void;
	onLyricsSizePtChange: (fontSizePt: number) => void;
	onCondenseScaleChange: (scale: number) => void;
	onShowCreditsChange: (showCredits: boolean) => void;
	songTitle: string;
	songId: string;
	trackNumber: number;
	lyricsSizePt: number;
	condenseScale: number;
	showCredits: boolean;
}) {
	const groupName = `zine-lyrics-cols-${songId}`;
	const fieldIdPrefix = `${songId}-zine-lyrics-cols`;
	const lyricsSliderId = `${songId}-zine-lyrics-font-size`;
	const condenseSliderId = `${songId}-zine-text-condense`;
	const creditsToggleId = `${songId}-zine-show-credits`;

	return (
		<fieldset className="m-0 space-y-3 border-0 p-0">
			<legend className="mb-2 line-clamp-3 font-medium text-foreground text-sm leading-snug">
				Track {trackNumber}: {songTitle}
			</legend>
			<p className="text-muted-foreground text-xs leading-snug">
				Columns, lyrics size, title width, credits · screen preview only
			</p>
			<div className="space-y-2">
				<ZineLyricsFontSizeSlider
					currentPt={formatZineLyricsSizePt(lyricsSizePt)}
					onChangePt={onLyricsSizePtChange}
					rangeId={lyricsSliderId}
					valuePt={lyricsSizePt}
				/>
				<ZineTextCondenseSlider
					condensePercentLabel={formatCondensePercent(condenseScale)}
					onCondenseScaleChange={onCondenseScaleChange}
					rangeId={condenseSliderId}
					valueScale={condenseScale}
				/>
				<ZineLyricsColumnOptionRow
					checked={mode === 1}
					groupName={groupName}
					id={`${fieldIdPrefix}-one`}
					label="1 column"
					onSelect={() => onModeChange(1)}
				/>
				<ZineLyricsColumnOptionRow
					checked={mode === 2}
					groupName={groupName}
					id={`${fieldIdPrefix}-two`}
					label="2 columns"
					onSelect={() => onModeChange(2)}
				/>
				<ZineToggleControl
					checked={showCredits}
					id={creditsToggleId}
					label="Show credits"
					onCheckedChange={onShowCreditsChange}
				/>
			</div>
		</fieldset>
	);
}

function ZineLyricsFontSizeSlider({
	rangeId,
	valuePt,
	currentPt,
	onChangePt,
}: {
	rangeId: string;
	valuePt: number;
	currentPt: string;
	onChangePt: (fontSizePt: number) => void;
}) {
	return (
		<div className="space-y-2 rounded-md border bg-background px-2 py-2">
			<div className="flex items-baseline justify-between gap-3">
				<Label htmlFor={rangeId} className="text-sm">
					Lyrics size
				</Label>
				<span aria-live="polite" className="text-muted-foreground text-xs">
					{currentPt}
				</span>
			</div>
			<div className="px-1 pt-0.5 pb-1">
				<Slider
					id={rangeId}
					max={ZINE_LYRICS_SIZE_SLIDER.maxPt}
					min={ZINE_LYRICS_SIZE_SLIDER.minPt}
					onValueChange={(values) => {
						const next = values[0];
						if (next !== undefined) {
							onChangePt(next);
						}
					}}
					step={ZINE_LYRICS_SIZE_SLIDER.stepPt}
					value={[valuePt]}
				/>
			</div>
		</div>
	);
}

function ZineTextCondenseSlider({
	rangeId,
	valueScale,
	condensePercentLabel,
	onCondenseScaleChange,
}: {
	rangeId: string;
	valueScale: number;
	condensePercentLabel: string;
	onCondenseScaleChange: (scale: number) => void;
}) {
	return (
		<div className="space-y-2 rounded-md border bg-background px-2 py-2">
			<div className="flex items-baseline justify-between gap-3">
				<Label htmlFor={rangeId} className="text-sm">
					Title
				</Label>
				<span aria-live="polite" className="text-muted-foreground text-xs">
					{condensePercentLabel}
				</span>
			</div>
			<div className="px-1 pt-0.5 pb-1">
				<Slider
					id={rangeId}
					max={ZINE_TEXT_CONDENSE.max}
					min={ZINE_TEXT_CONDENSE.min}
					onValueChange={(values) => {
						const next = values[0];
						if (next !== undefined) {
							onCondenseScaleChange(next);
						}
					}}
					step={ZINE_TEXT_CONDENSE.step}
					value={[valueScale]}
				/>
			</div>
		</div>
	);
}

function ZineLyricsColumnOptionRow({
	groupName,
	id,
	label,
	checked,
	onSelect,
}: {
	groupName: string;
	id: string;
	label: string;
	checked: boolean;
	onSelect: () => void;
}) {
	return (
		<label
			htmlFor={id}
			className="flex cursor-pointer items-center gap-2 rounded-md border bg-background px-2 py-1.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
		>
			<input
				checked={checked}
				id={id}
				name={groupName}
				onChange={() => onSelect()}
				type="radio"
				className="h-4 w-4 shrink-0 border-input accent-[var(--accent)]"
			/>
			<span className="text-sm">{label}</span>
		</label>
	);
}

function ZineDuplexBindingOptionRow({
	groupName,
	id,
	label,
	checked,
	onSelect,
}: {
	groupName: string;
	id: string;
	label: ReactNode;
	checked: boolean;
	onSelect: () => void;
}) {
	return (
		<label
			htmlFor={id}
			className="flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring sm:min-w-0 sm:flex-1"
		>
			<input
				checked={checked}
				className="h-4 w-4 shrink-0 border-input accent-[var(--accent)]"
				id={id}
				name={groupName}
				onChange={() => onSelect()}
				type="radio"
			/>
			<span className="text-muted-foreground text-sm leading-snug">
				{label}
			</span>
		</label>
	);
}

function ZineToggleControl({
	id,
	checked,
	disabled = false,
	onCheckedChange,
	label,
}: {
	id: string;
	checked: boolean;
	disabled?: boolean;
	onCheckedChange: (checked: boolean) => void;
	label: string;
}) {
	return (
		<div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
			<Checkbox
				id={id}
				checked={checked}
				disabled={disabled}
				onCheckedChange={(nextChecked) => onCheckedChange(nextChecked === true)}
			/>
			<Label
				htmlFor={id}
				className={cn(
					"text-sm",
					disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
				)}
			>
				{label}
			</Label>
		</div>
	);
}
