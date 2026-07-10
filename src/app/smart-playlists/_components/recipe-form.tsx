"use client";

import { useMutation, useQuery } from "convex/react";
import { Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
	Combobox,
	ComboboxChip,
	ComboboxChips,
	ComboboxChipsInput,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxItem,
	ComboboxList,
	ComboboxTrigger,
	ComboboxValue,
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
	type SubTier,
	TIER_ORDER,
	type TierName,
	getRatingsForTier,
} from "~/lib/album-tiers";
import { ratingBoundsFromSelection } from "~/lib/smart-playlists/rating-range";
import type {
	AddedWindow,
	SmartPlaylistFilters,
	SmartPlaylistSource,
	SmartPlaylistSyncMode,
} from "~/lib/smart-playlists/types";
import { cn } from "~/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

const EMPTY_FILTERS: SmartPlaylistFilters = {
	genreKeys: [],
	genreMatch: "any",
	primaryGenresOnly: false,
	descriptorKeys: [],
	descriptorMatch: "any",
};

const SUB_TIERS: SubTier[] = ["High", "Med", "Low"];
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

type RatingMode = "none" | "tier" | "minTier";
type AddedWindowMode = "none" | "relative" | "calendar_month";

type RatingUiState = {
	mode: RatingMode;
	tier: TierName | "";
	subTier: SubTier | "";
	minTier: TierName | "";
};

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
	initialFilters = EMPTY_FILTERS,
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
	const [ratingUi, setRatingUi] = useState<RatingUiState>(() =>
		ratingUiFromFilters(initialFilters),
	);
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
		filters,
		now: previewNow,
	});

	const genreKeysPool = (genreOptions ?? []).map((g) => g.key).sort();
	const topLevelGenreKeysPool = (genreOptions ?? [])
		.filter((g) => g.isTopLevel)
		.map((g) => g.key)
		.sort();
	const genreLabelByKey = new Map(
		(genreOptions ?? []).map((g) => [g.key, g.label] as const),
	);
	const descriptorKeysPool = (descriptorOptions ?? []).map((d) => d.key).sort();
	const descriptorLabelByKey = new Map(
		(descriptorOptions ?? []).map((d) => [d.key, d.label] as const),
	);

	function formatGenreOption(key: string): string {
		return genreLabelByKey.get(key) ?? key;
	}

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

	function applyRatingUi(next: RatingUiState): void {
		setRatingUi(next);

		if (next.mode === "none") {
			patchFilters({ ratingMin: undefined, ratingMax: undefined });
			return;
		}

		if (next.mode === "minTier" && next.minTier) {
			const bounds = ratingBoundsFromSelection({ minTier: next.minTier });
			patchFilters({
				ratingMin: bounds.ratingMin,
				ratingMax: bounds.ratingMax,
			});
			return;
		}

		if (next.mode === "tier" && next.tier) {
			const bounds = ratingBoundsFromSelection({
				tier: next.tier,
				subTier: next.subTier || undefined,
			});
			patchFilters({
				ratingMin: bounds.ratingMin,
				ratingMax: bounds.ratingMax,
			});
		}
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

	async function handleSubmit(
		event: React.FormEvent<HTMLFormElement>,
	): Promise<void> {
		event.preventDefault();

		const trimmedName = name.trim();
		if (!trimmedName) {
			toast.error("Name is required");
			return;
		}

		const nextFilters = buildSubmitFilters({
			filters,
			source,
			addedWindowUi,
		});

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
				filters: nextFilters,
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

			<div className="space-y-4 rounded-lg border bg-card p-4">
				<h2 className="font-medium text-sm">Filters</h2>

				<div className="grid gap-4 md:grid-cols-2">
					<div className="flex flex-col gap-1.5 md:col-span-2">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<Label htmlFor="recipe-genres">Genres</Label>
							<fieldset className="m-0 inline-flex rounded-md border border-border bg-background px-0.5 py-0.5">
								<SegmentButton
									active={filters.genreMatch === "any"}
									onClick={() => patchFilters({ genreMatch: "any" })}
								>
									Any
								</SegmentButton>
								<SegmentButton
									active={filters.genreMatch === "all"}
									onClick={() => patchFilters({ genreMatch: "all" })}
								>
									All
								</SegmentButton>
							</fieldset>
						</div>
						<Combobox
							items={genreKeysPool}
							browseItems={topLevelGenreKeysPool}
							multiple
							getItemLabel={formatGenreOption}
							value={filters.genreKeys}
							onValueChange={(genreKeys) => patchFilters({ genreKeys })}
						>
							<ComboboxTrigger>
								<ComboboxChips>
									<ComboboxValue>
										{filters.genreKeys.map((key) => (
											<ComboboxChip key={key} value={key}>
												{formatGenreOption(key)}
											</ComboboxChip>
										))}
									</ComboboxValue>
									<ComboboxChipsInput
										id="recipe-genres"
										placeholder="Add genre"
									/>
								</ComboboxChips>
							</ComboboxTrigger>
							<ComboboxContent>
								<ComboboxEmpty>No genres found.</ComboboxEmpty>
								<ComboboxList>
									{(item) => (
										<ComboboxItem key={item} value={item}>
											{formatGenreOption(item)}
										</ComboboxItem>
									)}
								</ComboboxList>
							</ComboboxContent>
						</Combobox>
						<div className="flex items-center gap-2 pt-1">
							<Checkbox
								id="recipe-primary-genres"
								checked={filters.primaryGenresOnly}
								onCheckedChange={(checked) =>
									patchFilters({ primaryGenresOnly: checked === true })
								}
							/>
							<Label htmlFor="recipe-primary-genres" className="font-normal">
								Primary genres only
							</Label>
						</div>
					</div>

					<div className="flex flex-col gap-1.5 md:col-span-2">
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
							getItemLabel={formatDescriptorOption}
							value={filters.descriptorKeys}
							onValueChange={(descriptorKeys) =>
								patchFilters({ descriptorKeys })
							}
						>
							<ComboboxTrigger>
								<ComboboxChips>
									<ComboboxValue>
										{filters.descriptorKeys.map((key) => (
											<ComboboxChip key={key} value={key}>
												{formatDescriptorOption(key)}
											</ComboboxChip>
										))}
									</ComboboxValue>
									<ComboboxChipsInput
										id="recipe-descriptors"
										placeholder="Add descriptor"
									/>
								</ComboboxChips>
							</ComboboxTrigger>
							<ComboboxContent>
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

					<div className="flex flex-col gap-1.5 md:col-span-2">
						<Label>Rating</Label>
						<div className="flex flex-wrap items-end gap-3">
							<div className="space-y-1.5">
								<Label className="text-muted-foreground text-xs">Mode</Label>
								<Select
									value={ratingUi.mode}
									onValueChange={(value) => {
										const modeValue = value as RatingMode;
										applyRatingUi({
											mode: modeValue,
											tier:
												modeValue === "tier"
													? ratingUi.tier || "Holy Moly"
													: "",
											subTier: modeValue === "tier" ? ratingUi.subTier : "",
											minTier:
												modeValue === "minTier"
													? ratingUi.minTier || "Really Enjoyed"
													: "",
										});
									}}
								>
									<SelectTrigger className="w-[160px]">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="none">Any</SelectItem>
										<SelectItem value="tier">Exact tier</SelectItem>
										<SelectItem value="minTier">Or above</SelectItem>
									</SelectContent>
								</Select>
							</div>

							{ratingUi.mode === "tier" ? (
								<>
									<div className="space-y-1.5">
										<Label className="text-muted-foreground text-xs">
											Tier
										</Label>
										<Select
											value={ratingUi.tier || undefined}
											onValueChange={(value) =>
												applyRatingUi({
													...ratingUi,
													tier: value as TierName,
												})
											}
										>
											<SelectTrigger className="w-[180px]">
												<SelectValue placeholder="Tier" />
											</SelectTrigger>
											<SelectContent>
												{TIER_ORDER.map((tier) => (
													<SelectItem key={tier} value={tier}>
														{tier}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									<div className="space-y-1.5">
										<Label className="text-muted-foreground text-xs">
											Sub-tier
										</Label>
										<Select
											value={ratingUi.subTier || "any"}
											onValueChange={(value) =>
												applyRatingUi({
													...ratingUi,
													subTier: value === "any" ? "" : (value as SubTier),
												})
											}
										>
											<SelectTrigger className="w-[120px]">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="any">Any</SelectItem>
												{SUB_TIERS.map((subTier) => (
													<SelectItem key={subTier} value={subTier}>
														{subTier}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								</>
							) : null}

							{ratingUi.mode === "minTier" ? (
								<div className="space-y-1.5">
									<Label className="text-muted-foreground text-xs">
										Min tier
									</Label>
									<Select
										value={ratingUi.minTier || undefined}
										onValueChange={(value) =>
											applyRatingUi({
												...ratingUi,
												minTier: value as TierName,
											})
										}
									>
										<SelectTrigger className="w-[180px]">
											<SelectValue placeholder="Tier" />
										</SelectTrigger>
										<SelectContent>
											{TIER_ORDER.map((tier) => (
												<SelectItem key={tier} value={tier}>
													{tier}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							) : null}
						</div>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="recipe-year-min">Year min</Label>
						<Input
							id="recipe-year-min"
							type="number"
							inputMode="numeric"
							value={filters.yearMin ?? ""}
							onChange={(event) =>
								patchFilters({
									yearMin: parseOptionalNumber(event.target.value),
								})
							}
							placeholder="e.g. 1990"
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="recipe-year-max">Year max</Label>
						<Input
							id="recipe-year-max"
							type="number"
							inputMode="numeric"
							value={filters.yearMax ?? ""}
							onChange={(event) =>
								patchFilters({
									yearMax: parseOptionalNumber(event.target.value),
								})
							}
							placeholder="e.g. 2024"
						/>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="recipe-duration-min">Duration min (min)</Label>
						<Input
							id="recipe-duration-min"
							type="number"
							inputMode="numeric"
							value={filters.durationMinMinutes ?? ""}
							onChange={(event) =>
								patchFilters({
									durationMinMinutes: parseOptionalNumber(event.target.value),
								})
							}
							placeholder="e.g. 30"
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="recipe-duration-max">Duration max (min)</Label>
						<Input
							id="recipe-duration-max"
							type="number"
							inputMode="numeric"
							value={filters.durationMaxMinutes ?? ""}
							onChange={(event) =>
								patchFilters({
									durationMaxMinutes: parseOptionalNumber(event.target.value),
								})
							}
							placeholder="e.g. 60"
						/>
					</div>

					{source === "forLater" ? (
						<div className="flex flex-col gap-3 md:col-span-2">
							<Label>Added window</Label>
							<div className="flex flex-wrap items-end gap-3">
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
										<SelectTrigger className="w-[180px]">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="none">Any time</SelectItem>
											<SelectItem value="relative">
												Last N days/months
											</SelectItem>
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
												className="w-[100px]"
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
												<SelectTrigger className="w-[120px]">
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
												className="w-[100px]"
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
												<SelectTrigger className="w-[150px]">
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
							<li key={album.spotifyAlbumId} className="truncate">
								<span className="font-medium">{album.name}</span>
								<span className="text-muted-foreground">
									{" "}
									· {album.artistName}
								</span>
							</li>
						))}
						{preview.albumCount > preview.albums.length ? (
							<li className="text-muted-foreground">
								+{preview.albumCount - preview.albums.length} more
							</li>
						) : null}
					</ul>
				)}
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

function parseOptionalNumber(value: string): number | undefined {
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	const parsed = Number(trimmed);
	return Number.isFinite(parsed) ? parsed : undefined;
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

function ratingUiFromFilters(filters: SmartPlaylistFilters): RatingUiState {
	const { ratingMin, ratingMax } = filters;

	if (ratingMin === undefined && ratingMax === undefined) {
		return { mode: "none", tier: "", subTier: "", minTier: "" };
	}

	if (ratingMax === undefined && ratingMin !== undefined) {
		for (const tier of TIER_ORDER) {
			if (getRatingsForTier(tier).low === ratingMin) {
				return { mode: "minTier", tier: "", subTier: "", minTier: tier };
			}
		}
	}

	if (ratingMin !== undefined && ratingMax !== undefined) {
		for (const tier of TIER_ORDER) {
			const ratings = getRatingsForTier(tier);
			if (ratingMin === ratings.low && ratingMax === ratings.high) {
				return { mode: "tier", tier, subTier: "", minTier: "" };
			}
			if (ratingMin === ratings.high && ratingMax === ratings.high) {
				return { mode: "tier", tier, subTier: "High", minTier: "" };
			}
			if (ratingMin === ratings.med && ratingMax === ratings.med) {
				return { mode: "tier", tier, subTier: "Med", minTier: "" };
			}
			if (ratingMin === ratings.low && ratingMax === ratings.low) {
				return { mode: "tier", tier, subTier: "Low", minTier: "" };
			}
		}
	}

	return { mode: "none", tier: "", subTier: "", minTier: "" };
}

function buildSubmitFilters({
	filters,
	source,
	addedWindowUi,
}: {
	filters: SmartPlaylistFilters;
	source: SmartPlaylistSource;
	addedWindowUi: AddedWindowUiState;
}): SmartPlaylistFilters {
	const next: SmartPlaylistFilters = {
		genreKeys: filters.genreKeys,
		genreMatch: filters.genreMatch,
		primaryGenresOnly: filters.primaryGenresOnly,
		descriptorKeys: filters.descriptorKeys,
		descriptorMatch: filters.descriptorMatch,
	};

	if (filters.ratingMin !== undefined) next.ratingMin = filters.ratingMin;
	if (filters.ratingMax !== undefined) next.ratingMax = filters.ratingMax;
	if (filters.yearMin !== undefined) next.yearMin = filters.yearMin;
	if (filters.yearMax !== undefined) next.yearMax = filters.yearMax;
	if (filters.durationMinMinutes !== undefined) {
		next.durationMinMinutes = filters.durationMinMinutes;
	}
	if (filters.durationMaxMinutes !== undefined) {
		next.durationMaxMinutes = filters.durationMaxMinutes;
	}

	if (source === "forLater") {
		const addedWindow = buildAddedWindow(addedWindowUi);
		if (addedWindow) next.addedWindow = addedWindow;
	}

	return next;
}
