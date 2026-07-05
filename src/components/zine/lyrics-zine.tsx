"use client";

import { ArrowLeft, Pencil, Printer } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Fragment, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import { Slider } from "~/components/ui/slider";
import { cn } from "~/lib/utils";
import {
	ZINE_INTRO_FONT_SIZE_SLIDER,
	ZINE_INTRO_MARGIN_SLIDER,
	ZINE_INTRO_SPACING_SLIDER,
	resolveZineIntroSettings,
	type ZineIntroSettings,
} from "~/lib/zine/zine-intro-layout";
import { buildBookletSheets } from "~/lib/zine/zine-booklet";
import {
	resolveZineDisplaySettings,
	type ZineDisplaySettings,
} from "~/lib/zine/zine-display-settings";
import {
	resolveZineCoverTextLayout,
	type ZineCoverTextLayout,
} from "~/lib/zine/zine-cover-text-layout";
import {
	ZINE_LYRICS_SIZE_SLIDER,
	ZINE_TEXT_CONDENSE,
} from "~/lib/zine/zine-layout";
import type { ZineInsideBackSection } from "~/lib/zine/zine-inside-back-sections";
import { buildZinePages } from "~/lib/zine/zine-pages";
import type {
	ZineBackCoverQrCodes,
	ZineItemSettings,
	ZineSongDisplayInput,
} from "~/lib/zine/zine-types";
import {
	getHiddenCreditLabelsForRestore,
	type CreditVisibilityState,
} from "../../../convex/_utils/geniusCreditVisibility";
import { ZineCoverPage } from "./zine-cover-page";
import { ZineCoverTextLayoutControls } from "./zine-cover-text-layout-controls";
import { ZineInstrumentalGroupPage } from "./zine-instrumental-group-page";
import { IntroContentEditor } from "./intro-content-editor";
import { ZineInsideBackPage } from "./zine-inside-back-page";
import { ZineIntroPage } from "./zine-intro-page";
import { triggerZinePrintRemeasure } from "./zine-print-remeasure";
import { ZinePrintStyles } from "./zine-print-styles";
import {
	type ZineDisplayOptions,
	type ZineLyricsColumnMode,
	ZineSongPage,
} from "./zine-song-page";

export type LyricsZinePersistence = {
	saveItemSettings(songId: string, settings: ZineItemSettings): void;
	hideCreditLabel?(songId: string, label: string): void;
	showCreditLabel?(songId: string, label: string): void;
	saveCover(
		url: string | undefined,
		storageId?: string,
	): Promise<{ coverImageUrl?: string }>;
	saveGreyscale(on: boolean): void;
	generateUploadUrl(): Promise<string>;
	saveIntroSettings?(settings: ZineIntroSettings): void;
	saveDisplaySettings?(settings: ZineDisplaySettings): void;
	saveIntroPageContent?(content: string): void;
	saveSongIntroContent?(songId: string, content: string): void;
	saveCoverTextLayout?(layout: ZineCoverTextLayout): void;
};

type ZineDuplexBinding = "long-edge" | "short-edge";

export function LyricsZine({
	collectionTitle,
	coverArtistName,
	backHref,
	songs,
	cover,
	backCoverQrCodes,
	itemSettingsById,
	siteWideHiddenCreditLabelKeys = [],
	ignoredCreditLabelKeys = [],
	canEdit,
	persistence,
	introPage,
	displaySettings: displaySettingsProp,
	coverTextLayout: coverTextLayoutProp,
	insideBackSections,
}: {
	collectionTitle: string;
	coverArtistName?: string;
	backHref: string;
	songs: ZineSongDisplayInput[];
	cover: { imageUrl?: string; greyscale: boolean };
	backCoverQrCodes?: ZineBackCoverQrCodes;
	itemSettingsById: Record<string, ZineItemSettings>;
	siteWideHiddenCreditLabelKeys?: string[];
	ignoredCreditLabelKeys?: string[];
	canEdit: boolean;
	persistence?: LyricsZinePersistence;
	introPage?: {
		content: string;
		settings?: Partial<ZineIntroSettings>;
	};
	displaySettings?: Partial<ZineDisplaySettings> | null;
	coverTextLayout?: Partial<ZineCoverTextLayout> | null;
	insideBackSections?: ZineInsideBackSection[];
}) {
	const [duplexBinding, setDuplexBinding] =
		useState<ZineDuplexBinding>("short-edge");
	const [displaySettings, setDisplaySettings] = useState<ZineDisplaySettings>(
		() => resolveZineDisplaySettings(displaySettingsProp),
	);
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
	const [coverTextLayout, setCoverTextLayout] = useState<ZineCoverTextLayout>(
		() => resolveZineCoverTextLayout(coverTextLayoutProp),
	);
	const [isUploadingCover, setIsUploadingCover] = useState(false);
	const [introSettings, setIntroSettings] = useState<ZineIntroSettings>(() =>
		resolveZineIntroSettings(introPage?.settings),
	);
	const [introPageContent, setIntroPageContent] = useState(
		introPage?.content ?? "",
	);
	const [songIntroContentById, setSongIntroContentById] = useState<
		Record<string, string>
	>({});

	const persistZineTimersRef = useRef<Map<string, number>>(new Map());
	const persistIntroSettingsTimerRef = useRef<number | undefined>(undefined);
	const persistIntroPageContentTimerRef = useRef<number | undefined>(undefined);
	const persistSongIntroContentTimersRef = useRef<Map<string, number>>(
		new Map(),
	);
	const persistDisplaySettingsTimerRef = useRef<number | undefined>(undefined);
	const persistCoverTextLayoutTimerRef = useRef<number | undefined>(undefined);
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
			if (persistIntroSettingsTimerRef.current !== undefined) {
				clearTimeout(persistIntroSettingsTimerRef.current);
			}
			if (persistDisplaySettingsTimerRef.current !== undefined) {
				clearTimeout(persistDisplaySettingsTimerRef.current);
			}
			if (persistCoverTextLayoutTimerRef.current !== undefined) {
				clearTimeout(persistCoverTextLayoutTimerRef.current);
			}
			if (persistIntroPageContentTimerRef.current !== undefined) {
				clearTimeout(persistIntroPageContentTimerRef.current);
			}
			for (const timer of persistSongIntroContentTimersRef.current.values()) {
				clearTimeout(timer);
			}
			persistSongIntroContentTimersRef.current.clear();
		};
	}, []);

	const songsForPages = songs.map((song) => ({
		...song,
		introContent:
			song.id in songIntroContentById
				? songIntroContentById[song.id]
				: song.introContent,
	}));

	const displayOptions: ZineDisplayOptions = {
		showArtist: displaySettings.showArtist,
		showAlbum: displaySettings.showAlbum,
		showYear: displaySettings.showYear,
		showAlbumArt: displaySettings.showAlbumArt,
		showIntro: displaySettings.showIntro,
		showGeniusInfo: displaySettings.showGeniusInfo,
		showSectionLabels: displaySettings.showSectionLabels,
		showUserNote: canEdit && displaySettings.showUserNote,
	};

	const resolvedCoverImageUrl = coverImageUrl.trim() || undefined;
	const resolvedCoverGreyscale =
		coverGreyscale && Boolean(resolvedCoverImageUrl);

	const pages = buildZinePages({
		playlistTitle: collectionTitle,
		coverArtistName,
		songs: songsForPages,
		intro: introPage
			? {
					content: introPageContent,
					settings: introSettings,
					includeWhenEmpty: canEdit,
				}
			: undefined,
		collapseInstrumentalTracks: !displaySettings.separateInstrumentalPages,
		showSectionLabels: displaySettings.showSectionLabels,
		insideBack: {
			sections: insideBackSections ?? [],
			includeWhenEmpty: canEdit,
		},
	});
	const bookletSheets = buildBookletSheets(pages);
	const songsById = new Map(songsForPages.map((song) => [song.id, song]));
	const creditVisibility: CreditVisibilityState = {
		siteWideHiddenLabelKeys: siteWideHiddenCreditLabelKeys,
		ignoredLabelKeys: ignoredCreditLabelKeys,
	};

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

	function queueDebouncedPersistIntroSettings(settings: ZineIntroSettings): void {
		const persist = persistence?.saveIntroSettings;
		if (!persist) return;

		if (persistIntroSettingsTimerRef.current !== undefined) {
			clearTimeout(persistIntroSettingsTimerRef.current);
		}

		persistIntroSettingsTimerRef.current = window.setTimeout(() => {
			persistIntroSettingsTimerRef.current = undefined;
			persist(settings);
		}, 500);
	}

	function updateIntroSettings(nextSettings: ZineIntroSettings): void {
		setIntroSettings(nextSettings);
		queueDebouncedPersistIntroSettings(nextSettings);
	}

	function updateCoverTextLayout(nextLayout: ZineCoverTextLayout): void {
		setCoverTextLayout(nextLayout);
		queueDebouncedPersistCoverTextLayout(nextLayout);
	}

	function queueDebouncedPersistCoverTextLayout(
		layout: ZineCoverTextLayout,
	): void {
		const persist = persistence?.saveCoverTextLayout;
		if (!persist) return;

		if (persistCoverTextLayoutTimerRef.current !== undefined) {
			clearTimeout(persistCoverTextLayoutTimerRef.current);
		}

		persistCoverTextLayoutTimerRef.current = window.setTimeout(() => {
			persistCoverTextLayoutTimerRef.current = undefined;
			persist(layout);
		}, 500);
	}

	function updateIntroPageContent(nextContent: string): void {
		setIntroPageContent(nextContent);
		queueDebouncedPersistIntroPageContent(nextContent);
	}

	function queueDebouncedPersistIntroPageContent(content: string): void {
		const persist = persistence?.saveIntroPageContent;
		if (!persist) return;

		if (persistIntroPageContentTimerRef.current !== undefined) {
			clearTimeout(persistIntroPageContentTimerRef.current);
		}

		persistIntroPageContentTimerRef.current = window.setTimeout(() => {
			persistIntroPageContentTimerRef.current = undefined;
			persist(content);
		}, 500);
	}

	function updateSongIntroContent(songId: string, nextContent: string): void {
		setSongIntroContentById((previous) => ({
			...previous,
			[songId]: nextContent,
		}));
		queueDebouncedPersistSongIntroContent(songId, nextContent);
	}

	function queueDebouncedPersistSongIntroContent(
		songId: string,
		content: string,
	): void {
		const persist = persistence?.saveSongIntroContent;
		if (!persist) return;

		const existing = persistSongIntroContentTimersRef.current.get(songId);
		if (existing !== undefined) {
			clearTimeout(existing);
		}

		const timeoutId = window.setTimeout(() => {
			persistSongIntroContentTimersRef.current.delete(songId);
			persist(songId, content);
		}, 500);

		persistSongIntroContentTimersRef.current.set(songId, timeoutId);
	}

	function getSongIntroContent(songId: string): string {
		if (songId in songIntroContentById) {
			return songIntroContentById[songId] ?? "";
		}

		return songsById.get(songId)?.introContent ?? "";
	}

	function updateDisplaySettings(partial: Partial<ZineDisplaySettings>) {
		setDisplaySettings((previous) => {
			const next = { ...previous, ...partial };
			queueDebouncedPersistDisplaySettings(next);
			return next;
		});
	}

	function queueDebouncedPersistDisplaySettings(
		settings: ZineDisplaySettings,
	): void {
		const persist = persistence?.saveDisplaySettings;
		if (!persist) return;

		if (persistDisplaySettingsTimerRef.current !== undefined) {
			clearTimeout(persistDisplaySettingsTimerRef.current);
		}

		persistDisplaySettingsTimerRef.current = window.setTimeout(() => {
			persistDisplaySettingsTimerRef.current = undefined;
			persist(settings);
		}, 500);
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
					artistName={page.artistName}
					coverGreyscale={resolvedCoverGreyscale}
					coverImageUrl={resolvedCoverImageUrl}
					coverSide="front"
					coverTextLayout={coverTextLayout}
					playlistTitle={page.playlistTitle}
					useSheetSpreadBackground={options?.useSheetSpreadBackground}
				/>
			);
		}

		if (page.kind === "intro") {
			return (
				<ZineIntroPage
					key={`${keyPrefix}-intro`}
					canEdit={canEdit}
					content={page.content}
					settings={page.settings}
				/>
			);
		}

		if (page.kind === "instrumental-group") {
			return (
				<ZineInstrumentalGroupPage
					key={`${keyPrefix}-instrumental-group-${page.songs.map((song) => song.songId).join("-")}`}
					canEditCredits={canEdit}
					creditVisibility={creditVisibility}
					displayOptions={displayOptions}
					getShowCredits={(songId) => !(songId in songCreditsHidden)}
					getTitleCondenseScale={(songId) =>
						getCondenseScaleForSong(songTextCondenseScales, songId)
					}
					onHideCreditLabel={
						canEdit && persistence?.hideCreditLabel
							? (songId, label) =>
									persistence.hideCreditLabel?.(songId, label)
							: undefined
					}
					songs={page.songs}
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
					canEditCredits={canEdit}
					creditVisibility={creditVisibility}
					displayOptions={displayOptions}
					lyricsColumnMode={lyricsColumnMode}
					lyricsTargetFontSizePt={lyricsTargetFontSizePt}
					onHideCreditLabel={
						canEdit && persistence?.hideCreditLabel
							? (label) => persistence.hideCreditLabel?.(page.songId, label)
							: undefined
					}
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
						credits: page.credits,
						hiddenCreditLabels: page.hiddenCreditLabels,
						shownCreditLabels: page.shownCreditLabels,
					}}
					titleCondenseScale={titleCondenseScale}
				/>
			);
		}

		if (page.kind === "inside-back") {
			return (
				<ZineInsideBackPage
					key={`${keyPrefix}-inside-back`}
					sections={page.sections}
					canEdit={canEdit}
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
								checked={displaySettings.showArtist}
								onCheckedChange={(checked) =>
									updateDisplaySettings({ showArtist: checked })
								}
								label="Show artist"
							/>
							<ZineToggleControl
								id="zine-show-album"
								checked={displaySettings.showAlbum}
								onCheckedChange={(checked) =>
									updateDisplaySettings({ showAlbum: checked })
								}
								label="Show album"
							/>
							<ZineToggleControl
								id="zine-show-year"
								checked={displaySettings.showYear}
								onCheckedChange={(checked) =>
									updateDisplaySettings({ showYear: checked })
								}
								label="Show year"
							/>
							<ZineToggleControl
								id="zine-show-album-art"
								checked={displaySettings.showAlbumArt}
								onCheckedChange={(checked) =>
									updateDisplaySettings({ showAlbumArt: checked })
								}
								label="Show album art"
							/>
							<ZineToggleControl
								id="zine-show-intro"
								checked={displaySettings.showIntro}
								onCheckedChange={(checked) =>
									updateDisplaySettings({ showIntro: checked })
								}
								label="Show intro"
							/>
							<ZineToggleControl
								id="zine-genius-info"
								checked={displaySettings.showGeniusInfo}
								onCheckedChange={(checked) =>
									updateDisplaySettings({ showGeniusInfo: checked })
								}
								label="Show Genius info"
							/>
							<ZineToggleControl
								id="zine-show-section-labels"
								checked={displaySettings.showSectionLabels}
								onCheckedChange={(checked) =>
									updateDisplaySettings({ showSectionLabels: checked })
								}
								label="Show song part labels"
							/>
							<ZineToggleControl
								id="zine-separate-instrumental-pages"
								checked={displaySettings.separateInstrumentalPages}
								onCheckedChange={(checked) =>
									updateDisplaySettings({ separateInstrumentalPages: checked })
								}
								label="Separate instrumental pages"
							/>
							{canEdit ? (
								<ZineToggleControl
									id="zine-show-user-note"
									checked={displaySettings.showUserNote}
									onCheckedChange={(checked) =>
										updateDisplaySettings({ showUserNote: checked })
									}
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
						if (page.kind === "cover") {
							return (
								<div
									key="zine-cover-page"
									className={cn(canEdit && "zine-song-preview-shell")}
								>
									{canEdit ? (
										<>
											<div className="flex shrink-0 justify-start">
												{renderPageByReadingIndex(index, `scr-${index}`)}
											</div>
											{persistence?.saveCoverTextLayout ? (
												<aside className="no-print zine-song-columns-panel rounded-lg border bg-card px-3 py-3 shadow-sm">
													<ZineCoverTextLayoutControls
														layout={coverTextLayout}
														onLayoutChange={updateCoverTextLayout}
													/>
												</aside>
											) : null}
										</>
									) : (
										renderPageByReadingIndex(index, `scr-${index}`)
									)}
								</div>
							);
						}

						if (page.kind === "intro") {
							return (
								<div
									key="zine-intro-page"
									className={cn(canEdit && "zine-song-preview-shell")}
								>
									{canEdit ? (
										<>
											<div className="flex shrink-0 justify-start">
												{renderPageByReadingIndex(index, `scr-${index}`)}
											</div>
											<aside className="no-print zine-song-columns-panel space-y-4 rounded-lg border bg-card px-3 py-3 shadow-sm">
												{persistence?.saveIntroPageContent ? (
													<ZineIntroPageContentDialog
														content={introPageContent}
														onContentChange={updateIntroPageContent}
													/>
												) : null}
												<ZineIntroLayoutControls
													settings={introSettings}
													onSettingsChange={updateIntroSettings}
												/>
											</aside>
										</>
									) : (
										renderPageByReadingIndex(index, `scr-${index}`)
									)}
								</div>
							);
						}

						if (page.kind === "instrumental-group") {
							const groupKey = page.songs.map((song) => song.songId).join("-");
							return (
								<div
									key={`instrumental-group-${groupKey}`}
									className={cn(canEdit && "zine-song-preview-shell")}
								>
									{canEdit ? (
										<>
											<div className="flex shrink-0 justify-start">
												{renderPageByReadingIndex(index, `scr-${index}`)}
											</div>
											<aside className="no-print zine-song-columns-panel rounded-lg border bg-card px-3 py-3 shadow-sm">
												<p className="text-muted-foreground text-sm">
													{page.songs.length} instrumental tracks share this
													page (up to 6 per page). Turn on &ldquo;Separate
													instrumental pages&rdquo; to give each its own page.
												</p>
											</aside>
										</>
									) : (
										renderPageByReadingIndex(index, `scr-${index}`)
									)}
								</div>
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
							const songInput = songsById.get(page.songId);
							const hiddenCreditLabelsForRestore = songInput
								? getHiddenCreditLabelsForRestore(songInput.credits, {
										hiddenCreditLabels: songInput.hiddenCreditLabels,
										shownCreditLabels: songInput.shownCreditLabels,
										siteWideHiddenLabelKeys: siteWideHiddenCreditLabelKeys,
										ignoredLabelKeys: ignoredCreditLabelKeys,
									})
								: [];
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
													hiddenCreditLabels={hiddenCreditLabelsForRestore}
													lyricsSizePt={lyricsTargetFontSizePt}
													mode={lyricsColumnMode}
													showCredits={showCredits}
													onRestoreCreditLabel={
														persistence?.showCreditLabel
															? (label) =>
																	persistence.showCreditLabel?.(
																		page.songId,
																		label,
																	)
															: undefined
													}
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
												{persistence?.saveSongIntroContent ? (
													<div className="border-t pt-3">
														<IntroContentEditor
															id={`${page.songId}-zine-track-intro`}
															value={getSongIntroContent(page.songId)}
															label="Track intro"
															placeholder="Optional intro for the INTRO section"
															helperText="Use **bold**, *italic*, and blank lines for paragraphs."
															textareaClassName="min-h-28 font-mono text-sm"
															onChange={(value) =>
																updateSongIntroContent(page.songId, value)
															}
														/>
													</div>
												) : null}
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

function ZineIntroPageContentDialog({
	content,
	onContentChange,
}: {
	content: string;
	onContentChange: (content: string) => void;
}) {
	const hasContent = content.trim() !== "";

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button type="button" variant="outline" className="w-full justify-start">
					<Pencil className="mr-2 h-4 w-4 shrink-0" />
					<span className="truncate">
						{hasContent ? "Edit album intro" : "Add album intro"}
					</span>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Album intro</DialogTitle>
					<DialogDescription>
						Appears on the page after the cover. Use **bold**, *italic*, and blank
						lines for paragraphs.
					</DialogDescription>
				</DialogHeader>
				<IntroContentEditor
					id="zine-intro-page-content"
					value={content}
					label="Intro copy"
					placeholder="Album intro page copy"
					helperText="Changes save automatically."
					textareaClassName="min-h-64 font-mono text-sm"
					onChange={onContentChange}
				/>
			</DialogContent>
		</Dialog>
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
	hiddenCreditLabels,
	onRestoreCreditLabel,
}: {
	mode: ZineLyricsColumnMode;
	onModeChange: (mode: ZineLyricsColumnMode) => void;
	onLyricsSizePtChange: (fontSizePt: number) => void;
	onCondenseScaleChange: (scale: number) => void;
	onShowCreditsChange: (showCredits: boolean) => void;
	onRestoreCreditLabel?: (label: string) => void;
	songTitle: string;
	songId: string;
	trackNumber: number;
	lyricsSizePt: number;
	condenseScale: number;
	showCredits: boolean;
	hiddenCreditLabels: string[];
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
				{hiddenCreditLabels.length > 0 && onRestoreCreditLabel ? (
					<div className="space-y-2 border-t pt-3">
						<p className="font-medium text-foreground text-xs">
							Hidden credits
						</p>
						<div className="flex flex-wrap gap-2">
							{hiddenCreditLabels.map((label) => (
								<Button
									key={`${songId}-restore-${label}`}
									type="button"
									variant="outline"
									size="sm"
									className="h-7 px-2 text-xs"
									onClick={() => onRestoreCreditLabel(label)}
								>
									Show {label}
								</Button>
							))}
						</div>
					</div>
				) : null}
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

function ZineIntroLayoutControls({
	settings,
	onSettingsChange,
}: {
	settings: ZineIntroSettings;
	onSettingsChange: (settings: ZineIntroSettings) => void;
}) {
	const spacingSliderId = "zine-intro-paragraph-spacing";
	const marginSliderId = "zine-intro-margin";
	const fontSizeSliderId = "zine-intro-font-size";
	const alignGroupName = "zine-intro-vertical-align";

	function patchSettings(partial: Partial<ZineIntroSettings>) {
		onSettingsChange({ ...settings, ...partial });
	}

	return (
		<fieldset className="m-0 space-y-3 border-0 p-0">
			<legend className="mb-2 font-medium text-foreground text-sm leading-snug">
				Intro page layout
			</legend>
			<p className="text-muted-foreground text-xs leading-snug">
				Spacing, margins, alignment · screen preview only
			</p>
			<div className="space-y-2">
				<div className="space-y-1">
					<div className="flex items-baseline justify-between gap-3">
						<Label htmlFor={fontSizeSliderId} className="text-sm">
							Font size
						</Label>
						<span
							aria-live="polite"
							className="text-muted-foreground text-xs"
						>
							{settings.fontSizePt.toFixed(1)} pt
						</span>
					</div>
					<div className="px-1 pt-0.5 pb-1">
						<Slider
							id={fontSizeSliderId}
							max={ZINE_INTRO_FONT_SIZE_SLIDER.maxPt}
							min={ZINE_INTRO_FONT_SIZE_SLIDER.minPt}
							onValueChange={(values) => {
								const next = values[0];
								if (next !== undefined) {
									patchSettings({ fontSizePt: next });
								}
							}}
							step={ZINE_INTRO_FONT_SIZE_SLIDER.stepPt}
							value={[settings.fontSizePt]}
						/>
					</div>
				</div>
				<div className="space-y-1">
					<div className="flex items-baseline justify-between gap-3">
						<Label htmlFor={spacingSliderId} className="text-sm">
							Paragraph spacing
						</Label>
						<span
							aria-live="polite"
							className="text-muted-foreground text-xs"
						>
							{settings.paragraphSpacingPt} pt
						</span>
					</div>
					<div className="px-1 pt-0.5 pb-1">
						<Slider
							id={spacingSliderId}
							max={ZINE_INTRO_SPACING_SLIDER.maxPt}
							min={ZINE_INTRO_SPACING_SLIDER.minPt}
							onValueChange={(values) => {
								const next = values[0];
								if (next !== undefined) {
									patchSettings({ paragraphSpacingPt: next });
								}
							}}
							step={ZINE_INTRO_SPACING_SLIDER.stepPt}
							value={[settings.paragraphSpacingPt]}
						/>
					</div>
				</div>
				<div className="space-y-1">
					<div className="flex items-baseline justify-between gap-3">
						<Label htmlFor={marginSliderId} className="text-sm">
							Margins
						</Label>
						<span
							aria-live="polite"
							className="text-muted-foreground text-xs"
						>
							{settings.marginPt} pt
						</span>
					</div>
					<div className="px-1 pt-0.5 pb-1">
						<Slider
							id={marginSliderId}
							max={ZINE_INTRO_MARGIN_SLIDER.maxPt}
							min={ZINE_INTRO_MARGIN_SLIDER.minPt}
							onValueChange={(values) => {
								const next = values[0];
								if (next !== undefined) {
									patchSettings({ marginPt: next });
								}
							}}
							step={ZINE_INTRO_MARGIN_SLIDER.stepPt}
							value={[settings.marginPt]}
						/>
					</div>
				</div>
				<ZineLyricsColumnOptionRow
					checked={settings.verticalAlign === "top"}
					groupName={alignGroupName}
					id="zine-intro-align-top"
					label="Align top"
					onSelect={() => patchSettings({ verticalAlign: "top" })}
				/>
				<ZineLyricsColumnOptionRow
					checked={settings.verticalAlign === "center"}
					groupName={alignGroupName}
					id="zine-intro-align-center"
					label="Align center"
					onSelect={() => patchSettings({ verticalAlign: "center" })}
				/>
			</div>
		</fieldset>
	);
}
