"use client";

import { useMutation, useQuery } from "convex/react";
import { Loader2, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { YearRangePicker } from "~/app/for-later-albums/_components/year-range-picker";
import { Button } from "~/components/ui/button";
import {
	Combobox,
	ComboboxChip,
	ComboboxChips,
	ComboboxChipsInput,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxItem,
	ComboboxList,
	ComboboxValue,
	useComboboxAnchor,
} from "~/components/ui/combobox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import {
	type AddedWindow,
	EMPTY_SMART_PLAYLIST_FILTERS,
	type SmartPlaylistFilters,
	type SmartPlaylistSource,
	type SmartPlaylistSyncMode,
} from "~/lib/smart-playlists/types";
import { cn } from "~/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { DurationRangeSlider } from "./duration-range-slider";
import { GenreClauseList } from "./genre-clause-list";
import { RatingRangeSlider } from "./rating-range-slider";

const MONTHS = [
	{ value: 1, label: "January" },
	{ value: 2, label: "February" },
	{ value: 3, label: "March" },
	{ value: 4, label: "April" },
	{ value: 5, label: "May" },
	{ value: 6, label: "June" },
	{ value: 7, label: "July" },
	{ value: 8, label: "August" },
	{ value: 9, label: "September" },
	{ value: 10, label: "October" },
	{ value: 11, label: "November" },
	{ value: 12, label: "December" },
];

const ADDED_PRESETS = [7, 14, 30, 90] as const;

type AddedWindowMode = "none" | "relative" | "calendar_month";

type AddedWindowUiState = {
	mode: AddedWindowMode;
	relativeAmount: string;
	relativeUnit: "days" | "months";
	calendarYear: string;
	calendarMonth: string;
};

export function RecipeForm({
	mode,
	userId,
	getValidAccessToken,
	recipeId,
	initialName = "",
	initialSource = "forLater",
	initialFilters = EMPTY_SMART_PLAYLIST_FILTERS,
	initialSyncMode = "mirror",
}: {
	mode: "create" | "edit";
	userId: string;
	getValidAccessToken: () => Promise<string | null>;
	recipeId?: Id<"smartPlaylists">;
	initialName?: string;
	initialSource?: SmartPlaylistSource;
	initialFilters?: SmartPlaylistFilters;
	initialSyncMode?: SmartPlaylistSyncMode;
}): React.ReactNode {
	const router = useRouter();
	const updateRecipe = useMutation(api.smartPlaylists.updateRecipe);

	const [name, setName] = useState(initialName);
	const [source, setSource] = useState<SmartPlaylistSource>(initialSource);
	const [syncMode, setSyncMode] =
		useState<SmartPlaylistSyncMode>(initialSyncMode);
	const [filters, setFilters] = useState<SmartPlaylistFilters>(initialFilters);
	const [addedWindowUi, setAddedWindowUi] = useState<AddedWindowUiState>(() =>
		addedWindowUiFromFilters(initialFilters),
	);
	const [previewNow, setPreviewNow] = useState(() => Date.now());
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isSyncing, setIsSyncing] = useState(false);

	const genreOptions = useQuery(
		api.rateYourMusicScrapes.listRateYourMusicGenreKeys,
		{ limit: 3000 },
	);
	const descriptorOptions = useQuery(
		api.rateYourMusicScrapes.listRateYourMusicDescriptorKeys,
		{ limit: 500 },
	);

	const preview = useQuery(api.smartPlaylists.previewMatches, {
		userId,
		source,
		filters: toConvexFilters(filters),
		now: previewNow,
	});

	const descriptorAnchor = useComboboxAnchor();

	const genreOptionsForClauses = (genreOptions ?? []).map((g) => ({
		key: g.key,
		label: g.label,
	}));

	const descriptorKeysPool = (descriptorOptions ?? []).map((d) => d.key).sort();
	const descriptorLabelByKey = new Map(
		(descriptorOptions ?? []).map((d) => [d.key, d.label] as const),
	);

	function formatDescriptorOption(key: string): string {
		return descriptorLabelByKey.get(key) ?? key;
	}

	function refreshPreviewNow(): void {
		setPreviewNow(Date.now());
	}

	function patchFilters(patch: Partial<SmartPlaylistFilters>): void {
		setFilters((current) => ({ ...current, ...patch }));
		refreshPreviewNow();
	}

	function excludeAlbum(albumId: Id<"spotifyAlbums">): void {
		if (filters.excludedAlbumIds.includes(albumId)) return;
		patchFilters({
			excludedAlbumIds: [...filters.excludedAlbumIds, albumId],
		});
	}

	function removeExclusion(albumId: string): void {
		patchFilters({
			excludedAlbumIds: filters.excludedAlbumIds.filter((id) => id !== albumId),
		});
	}

	function handleSourceChange(next: SmartPlaylistSource): void {
		setSource(next);
		if (next !== "forLater") {
			setAddedWindowUi(emptyAddedWindowUi());
			setFilters((current) => {
				const { addedWindow: _removed, ...rest } = current;
				return rest;
			});
		}
		refreshPreviewNow();
	}

	function applyAddedWindowUi(next: AddedWindowUiState): void {
		setAddedWindowUi(next);

		if (source !== "forLater" || next.mode === "none") {
			patchFilters({ addedWindow: undefined });
			return;
		}

		const window = buildAddedWindow(next);
		patchFilters({ addedWindow: window });
	}

	function handleAddedPreset(days: number): void {
		applyAddedWindowUi({
			...addedWindowUi,
			mode: "relative",
			relativeAmount: String(days),
			relativeUnit: "days",
		});
	}

	async function handleSubmit(
		event: React.FormEvent<HTMLFormElement>,
	): Promise<void> {
		event.preventDefault();

		const trimmedName = name.trim();
		if (!trimmedName) {
			toast.error("Name is required");
			return;
		}

		const nextFilters = normalizeFiltersForSave(filters, source);

		setIsSubmitting(true);
		try {
			if (mode === "create") {
				const accessToken = await getValidAccessToken();
				if (!accessToken) {
					toast.error("Connect Spotify before creating a recipe");
					return;
				}

				const response = await fetch("/api/smart-playlists/create", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-Access-Token": accessToken,
					},
					body: JSON.stringify({
						userId,
						name: trimmedName,
						source,
						filters: nextFilters,
						syncMode,
					}),
				});

				const body = (await response.json().catch(() => null)) as {
					error?: string;
					recipeId?: string;
					sync?: { success?: boolean; error?: string };
				} | null;

				if (!response.ok) {
					throw new Error(body?.error ?? "Failed to create recipe");
				}

				if (body?.sync && body.sync.success === false) {
					toast.error(
						body.sync.error ??
							`Created “${trimmedName}” but initial sync failed`,
					);
					router.push("/smart-playlists");
					return;
				}

				toast.success(`Created “${trimmedName}”`);
				router.push("/smart-playlists");
				return;
			}

			if (!recipeId) {
				throw new Error("Missing recipe id");
			}

			await updateRecipe({
				userId,
				recipeId,
				name: trimmedName,
				filters: toConvexFilters(nextFilters),
				syncMode,
			});
			toast.success(`Updated “${trimmedName}”`);
			router.push("/smart-playlists");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to save recipe",
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	async function handleSyncNow(): Promise<void> {
		if (!recipeId) return;

		setIsSyncing(true);
		try {
			const accessToken = await getValidAccessToken();
			if (!accessToken) {
				toast.error("Connect Spotify before syncing");
				return;
			}

			const response = await fetch("/api/smart-playlists/sync", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Access-Token": accessToken,
				},
				body: JSON.stringify({ userId, recipeId }),
			});

			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as {
					details?: string;
					error?: string;
				} | null;
				throw new Error(body?.details ?? body?.error ?? "Sync failed");
			}

			toast.success(`Synced “${name.trim() || "recipe"}”`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to sync recipe",
			);
		} finally {
			setIsSyncing(false);
		}
	}

	return (
		<form onSubmit={(event) => void handleSubmit(event)} className="space-y-8">
			<div className="space-y-4 rounded-lg border bg-card p-4">
				<div className="space-y-1.5">
					<Label htmlFor="recipe-name">Name</Label>
					<Input
						id="recipe-name"
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder="e.g. For Later Folk"
						autoComplete="off"
						required
					/>
				</div>

				<div className="space-y-1.5">
					<Label id="recipe-source">Source</Label>
					<fieldset
						className="m-0 inline-flex rounded-md border border-border bg-background px-0.5 py-0.5"
						aria-labelledby="recipe-source"
						disabled={mode === "edit"}
					>
						<SegmentButton
							active={source === "forLater"}
							disabled={mode === "edit"}
							onClick={() => handleSourceChange("forLater")}
						>
							For Later
						</SegmentButton>
						<SegmentButton
							active={source === "rankings"}
							disabled={mode === "edit"}
							onClick={() => handleSourceChange("rankings")}
						>
							Rankings
						</SegmentButton>
					</fieldset>
					{mode === "edit" ? (
						<p className="text-muted-foreground text-xs">
							Source can’t be changed after create.
						</p>
					) : null}
				</div>

				<div className="space-y-1.5">
					<Label id="recipe-sync-mode">Sync mode</Label>
					<fieldset
						className="m-0 inline-flex rounded-md border border-border bg-background px-0.5 py-0.5"
						aria-labelledby="recipe-sync-mode"
					>
						<SegmentButton
							active={syncMode === "mirror"}
							onClick={() => setSyncMode("mirror")}
						>
							Mirror
						</SegmentButton>
						<SegmentButton
							active={syncMode === "addOnly"}
							onClick={() => setSyncMode("addOnly")}
						>
							Add only
						</SegmentButton>
					</fieldset>
				</div>
			</div>

			<div className="space-y-6 rounded-lg border bg-card p-4">
				<h2 className="font-medium text-sm">Filters</h2>

				<GenreClauseList
					genreOptions={genreOptionsForClauses}
					clauses={filters.genreClauses}
					genreMatch={filters.genreMatch}
					onChange={(next) => patchFilters(next)}
				/>

				<RatingRangeSlider
					ratingMin={filters.ratingMin}
					ratingMax={filters.ratingMax}
					onChange={(next) => patchFilters(next)}
				/>

				<DurationRangeSlider
					durationOpenLow={filters.durationOpenLow}
					durationOpenHigh={filters.durationOpenHigh}
					durationMinMinutes={filters.durationMinMinutes}
					durationMaxMinutes={filters.durationMaxMinutes}
					onChange={(next) => patchFilters(next)}
				/>

				<div className="space-y-1.5">
					<Label htmlFor="recipe-year-range">Year</Label>
					<YearRangePicker
						yearMin={filters.yearMin}
						yearMax={filters.yearMax}
						onCommit={(bounds) => patchFilters(bounds)}
					/>
				</div>

				<div className="flex flex-col gap-1.5">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<Label htmlFor="recipe-descriptors">Descriptors</Label>
						<fieldset className="m-0 inline-flex rounded-md border border-border bg-background px-0.5 py-0.5">
							<SegmentButton
								active={filters.descriptorMatch === "any"}
								onClick={() => patchFilters({ descriptorMatch: "any" })}
							>
								Any
							</SegmentButton>
							<SegmentButton
								active={filters.descriptorMatch === "all"}
								onClick={() => patchFilters({ descriptorMatch: "all" })}
							>
								All
							</SegmentButton>
						</fieldset>
					</div>
					<Combobox
						items={descriptorKeysPool}
						multiple
						itemToStringLabel={formatDescriptorOption}
						value={filters.descriptorKeys}
						onValueChange={(descriptorKeys) => patchFilters({ descriptorKeys })}
					>
						<ComboboxChips ref={descriptorAnchor}>
							<ComboboxValue>
								{(values: string[]) => (
									<>
										{values.map((key) => (
											<ComboboxChip key={key}>
												{formatDescriptorOption(key)}
											</ComboboxChip>
										))}
										<ComboboxChipsInput
											id="recipe-descriptors"
											placeholder="Add descriptor"
										/>
									</>
								)}
							</ComboboxValue>
						</ComboboxChips>
						<ComboboxContent anchor={descriptorAnchor}>
							<ComboboxEmpty>No descriptors found.</ComboboxEmpty>
							<ComboboxList>
								{(item) => (
									<ComboboxItem key={item} value={item}>
										{formatDescriptorOption(item)}
									</ComboboxItem>
								)}
							</ComboboxList>
						</ComboboxContent>
					</Combobox>
				</div>

				{source === "forLater" ? (
					<div className="flex flex-col gap-3">
						<Label>Added window</Label>
						<div className="flex flex-wrap gap-2">
							{ADDED_PRESETS.map((days) => (
								<Button
									key={days}
									type="button"
									size="sm"
									variant={
										addedWindowUi.mode === "relative" &&
										addedWindowUi.relativeUnit === "days" &&
										addedWindowUi.relativeAmount === String(days)
											? "default"
											: "outline"
									}
									onClick={() => handleAddedPreset(days)}
								>
									Last {days}d
								</Button>
							))}
						</div>
						<div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
							<div className="space-y-1.5">
								<Label className="text-muted-foreground text-xs">Type</Label>
								<Select
									value={addedWindowUi.mode}
									onValueChange={(value) => {
										const modeValue = value as AddedWindowMode;
										applyAddedWindowUi({
											...addedWindowUi,
											mode: modeValue,
											relativeAmount:
												modeValue === "relative"
													? addedWindowUi.relativeAmount || "30"
													: addedWindowUi.relativeAmount,
											calendarYear:
												modeValue === "calendar_month"
													? addedWindowUi.calendarYear ||
														String(new Date().getFullYear())
													: addedWindowUi.calendarYear,
											calendarMonth:
												modeValue === "calendar_month"
													? addedWindowUi.calendarMonth ||
														String(new Date().getMonth() + 1)
													: addedWindowUi.calendarMonth,
										});
									}}
								>
									<SelectTrigger className="h-9 w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="none">Any time</SelectItem>
										<SelectItem value="relative">Last N days/months</SelectItem>
										<SelectItem value="calendar_month">
											Calendar month
										</SelectItem>
									</SelectContent>
								</Select>
							</div>

							{addedWindowUi.mode === "relative" ? (
								<>
									<div className="space-y-1.5">
										<Label
											htmlFor="recipe-added-amount"
											className="text-muted-foreground text-xs"
										>
											Amount
										</Label>
										<Input
											id="recipe-added-amount"
											type="number"
											inputMode="numeric"
											className="h-9 w-full"
											value={addedWindowUi.relativeAmount}
											onChange={(event) =>
												applyAddedWindowUi({
													...addedWindowUi,
													relativeAmount: event.target.value,
												})
											}
										/>
									</div>
									<div className="space-y-1.5">
										<Label className="text-muted-foreground text-xs">
											Unit
										</Label>
										<Select
											value={addedWindowUi.relativeUnit}
											onValueChange={(value) =>
												applyAddedWindowUi({
													...addedWindowUi,
													relativeUnit: value as "days" | "months",
												})
											}
										>
											<SelectTrigger className="h-9 w-full">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="days">Days</SelectItem>
												<SelectItem value="months">Months</SelectItem>
											</SelectContent>
										</Select>
									</div>
								</>
							) : null}

							{addedWindowUi.mode === "calendar_month" ? (
								<>
									<div className="space-y-1.5">
										<Label
											htmlFor="recipe-added-year"
											className="text-muted-foreground text-xs"
										>
											Year
										</Label>
										<Input
											id="recipe-added-year"
											type="number"
											inputMode="numeric"
											className="h-9 w-full"
											value={addedWindowUi.calendarYear}
											onChange={(event) =>
												applyAddedWindowUi({
													...addedWindowUi,
													calendarYear: event.target.value,
												})
											}
										/>
									</div>
									<div className="space-y-1.5">
										<Label className="text-muted-foreground text-xs">
											Month
										</Label>
										<Select
											value={addedWindowUi.calendarMonth || undefined}
											onValueChange={(value) =>
												applyAddedWindowUi({
													...addedWindowUi,
													calendarMonth: value,
												})
											}
										>
											<SelectTrigger className="h-9 w-full">
												<SelectValue placeholder="Month" />
											</SelectTrigger>
											<SelectContent>
												{MONTHS.map((month) => (
													<SelectItem
														key={month.value}
														value={String(month.value)}
													>
														{month.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								</>
							) : null}
						</div>
					</div>
				) : null}
			</div>

			<div className="space-y-3 rounded-lg border bg-card p-4">
				<div className="flex items-center justify-between gap-3">
					<h2 className="font-medium text-sm">Live preview</h2>
					<p className="text-muted-foreground text-sm">
						{preview === undefined
							? "Loading…"
							: `${preview.albumCount} album${preview.albumCount === 1 ? "" : "s"} · ~${preview.estimatedTrackCount} tracks`}
					</p>
				</div>
				{preview === undefined ? (
					<p className="text-muted-foreground text-sm">Resolving matches…</p>
				) : preview.albums.length === 0 ? (
					<p className="text-muted-foreground text-sm">No matching albums.</p>
				) : (
					<ul className="space-y-1 text-sm">
						{preview.albums.slice(0, 12).map((album) => (
							<li
								key={album.spotifyAlbumId}
								className="flex items-center justify-between gap-2"
							>
								<span className="truncate">
									<span className="font-medium">{album.name}</span>
									<span className="text-muted-foreground">
										{" "}
										· {album.artistName}
									</span>
								</span>
								<button
									type="button"
									className="text-muted-foreground text-xs hover:text-foreground"
									onClick={() => excludeAlbum(album.albumId)}
								>
									Exclude
								</button>
							</li>
						))}
						{preview.albumCount > preview.albums.length ? (
							<li className="text-muted-foreground">
								+{preview.albumCount - preview.albums.length} more
							</li>
						) : null}
					</ul>
				)}
				{filters.excludedAlbumIds.length > 0 ? (
					<div className="flex flex-col gap-1.5 border-t pt-3">
						<Label className="text-muted-foreground text-xs">
							Excluded albums
						</Label>
						<div className="flex flex-wrap gap-1.5">
							{filters.excludedAlbumIds.map((albumId) => {
								const known = preview?.albums.find(
									(album) => album.albumId === albumId,
								);
								return (
									<span
										key={albumId}
										className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs"
									>
										{known ? known.name : "Excluded album"}
										<button
											type="button"
											className="text-muted-foreground hover:text-foreground"
											aria-label="Remove exclusion"
											onClick={() => removeExclusion(albumId)}
										>
											<X className="size-3" />
										</button>
									</span>
								);
							})}
						</div>
					</div>
				) : null}
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<Button type="submit" disabled={isSubmitting}>
					{isSubmitting ? (
						<>
							<Loader2 className="size-4 animate-spin" />
							{mode === "create" ? "Creating…" : "Saving…"}
						</>
					) : mode === "create" ? (
						"Create recipe"
					) : (
						"Save changes"
					)}
				</Button>
				{mode === "edit" ? (
					<Button
						type="button"
						variant="outline"
						disabled={isSyncing}
						onClick={() => void handleSyncNow()}
					>
						{isSyncing ? (
							<Loader2 className="size-4 animate-spin" />
						) : (
							<RefreshCw className="size-4" />
						)}
						Sync now
					</Button>
				) : null}
				<Button type="button" variant="outline" asChild>
					<Link href="/smart-playlists">Cancel</Link>
				</Button>
			</div>
		</form>
	);
}

function SegmentButton({
	active,
	disabled,
	onClick,
	children,
}: {
	active: boolean;
	disabled?: boolean;
	onClick: () => void;
	children: React.ReactNode;
}): React.ReactNode {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			className={cn(
				"rounded px-2.5 py-1 font-medium text-sm disabled:cursor-not-allowed disabled:opacity-50",
				active
					? "bg-muted shadow-sm"
					: "text-muted-foreground hover:text-foreground",
			)}
		>
			{children}
		</button>
	);
}

function emptyAddedWindowUi(): AddedWindowUiState {
	return {
		mode: "none",
		relativeAmount: "30",
		relativeUnit: "days",
		calendarYear: String(new Date().getFullYear()),
		calendarMonth: String(new Date().getMonth() + 1),
	};
}

function addedWindowUiFromFilters(
	filters: SmartPlaylistFilters,
): AddedWindowUiState {
	const window = filters.addedWindow;
	if (!window) return emptyAddedWindowUi();

	if (window.type === "relative") {
		return {
			mode: "relative",
			relativeAmount: String(window.amount),
			relativeUnit: window.unit,
			calendarYear: String(new Date().getFullYear()),
			calendarMonth: String(new Date().getMonth() + 1),
		};
	}

	if (window.type === "calendar_month") {
		return {
			mode: "calendar_month",
			relativeAmount: "30",
			relativeUnit: "days",
			calendarYear: String(window.year),
			calendarMonth: String(window.month),
		};
	}

	return emptyAddedWindowUi();
}

function buildAddedWindow(ui: AddedWindowUiState): AddedWindow | undefined {
	if (ui.mode === "none") return undefined;

	if (ui.mode === "relative") {
		const amount = Number(ui.relativeAmount);
		if (!Number.isFinite(amount) || amount <= 0) return undefined;
		return { type: "relative", unit: ui.relativeUnit, amount };
	}

	const year = Number(ui.calendarYear);
	const month = Number(ui.calendarMonth);
	if (
		!Number.isFinite(year) ||
		!Number.isFinite(month) ||
		month < 1 ||
		month > 12
	) {
		return undefined;
	}

	return { type: "calendar_month", year, month };
}

/** Builds the V2 filters payload sent to Convex on create/update. */
function normalizeFiltersForSave(
	filters: SmartPlaylistFilters,
	source: SmartPlaylistSource,
): SmartPlaylistFilters {
	const next: SmartPlaylistFilters = {
		genreClauses: filters.genreClauses,
		genreMatch: filters.genreMatch,
		descriptorKeys: filters.descriptorKeys,
		descriptorMatch: filters.descriptorMatch,
		ratingMin: filters.ratingMin,
		ratingMax: filters.ratingMax,
		durationOpenLow: filters.durationOpenLow,
		durationOpenHigh: filters.durationOpenHigh,
		excludedAlbumIds: filters.excludedAlbumIds,
	};

	if (filters.yearMin !== undefined) next.yearMin = filters.yearMin;
	if (filters.yearMax !== undefined) next.yearMax = filters.yearMax;
	if (!filters.durationOpenLow && filters.durationMinMinutes !== undefined) {
		next.durationMinMinutes = filters.durationMinMinutes;
	}
	if (!filters.durationOpenHigh && filters.durationMaxMinutes !== undefined) {
		next.durationMaxMinutes = filters.durationMaxMinutes;
	}

	if (source === "forLater" && filters.addedWindow) {
		next.addedWindow = filters.addedWindow;
	}

	return next;
}

/** Client `excludedAlbumIds` are plain strings; Convex expects branded Ids. */
function toConvexFilters(filters: SmartPlaylistFilters) {
	return {
		...filters,
		excludedAlbumIds: filters.excludedAlbumIds as Id<"spotifyAlbums">[],
	};
}
