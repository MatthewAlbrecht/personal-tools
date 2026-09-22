"use client";

import { Plus, Search, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import {
	ZINE_PAGE_RECOMMENDATION_LIMITS,
	type ZinePageRecommendation,
	createEmptyPageRecommendation,
} from "~/lib/zine/zine-page-recommendations";
import { ZineRecommendationAlbumPickerDrawer } from "./zine-recommendation-album-picker-drawer";

export function ZinePageRecommendationsEditor({
	items,
	onChange,
	disabled = false,
	userId,
}: {
	items: ZinePageRecommendation[];
	onChange: (items: ZinePageRecommendation[]) => void;
	disabled?: boolean;
	userId?: string;
}) {
	const atMaxItems = items.length >= ZINE_PAGE_RECOMMENDATION_LIMITS.maxItems;

	function handleAddItem(): void {
		if (disabled || atMaxItems) {
			return;
		}

		onChange([...items, createEmptyPageRecommendation()]);
	}

	function handleRemoveItem(itemIndex: number): void {
		onChange(items.filter((_, index) => index !== itemIndex));
	}

	return (
		<div className="space-y-4">
			{items.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					No recommendations yet. Add up to four albums to show under the
					credits on this lyric page.
				</p>
			) : null}

			{items.map((item, itemIndex) => (
				<PageRecommendationItemEditor
					key={`page-recommendation-${itemIndex}`}
					disabled={disabled}
					item={item}
					itemIndex={itemIndex}
					userId={userId}
					onChange={(nextItem) => {
						onChange(
							items.map((current, index) =>
								index === itemIndex ? nextItem : current,
							),
						);
					}}
					onRemove={() => handleRemoveItem(itemIndex)}
				/>
			))}

			<div className="flex flex-wrap items-center gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={disabled || atMaxItems}
					onClick={handleAddItem}
				>
					<Plus className="h-4 w-4" />
					Add recommendation
				</Button>
				<p className="text-muted-foreground text-xs">
					{items.length} / {ZINE_PAGE_RECOMMENDATION_LIMITS.maxItems} albums
				</p>
			</div>
		</div>
	);
}

function PageRecommendationItemEditor({
	item,
	itemIndex,
	disabled,
	userId,
	onChange,
	onRemove,
}: {
	item: ZinePageRecommendation;
	itemIndex: number;
	disabled: boolean;
	userId?: string;
	onChange: (item: ZinePageRecommendation) => void;
	onRemove: () => void;
}) {
	const idPrefix = `page-recommendation-${itemIndex}`;
	const [pickerOpen, setPickerOpen] = useState(false);
	const initialSearch = item.albumTitle.trim() || item.artistName.trim();

	return (
		<div className="space-y-3 rounded-md border bg-background p-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="font-medium text-sm">Recommendation {itemIndex + 1}</p>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={disabled}
					onClick={onRemove}
				>
					<Trash2 className="h-4 w-4" />
					Remove
				</Button>
			</div>

			<ZineRecommendationAlbumPickerDrawer
				open={pickerOpen}
				onOpenChange={setPickerOpen}
				userId={userId}
				initialSearch={initialSearch}
				onSelect={(selection) => {
					onChange({
						...item,
						albumTitle: selection.albumTitle,
						artistName: selection.artistName,
						year: selection.year,
						imageUrl: selection.imageUrl,
						spotifyAlbumId: selection.spotifyAlbumId,
					});
				}}
			/>

			<div className="grid gap-3 sm:grid-cols-2">
				<div className="space-y-2">
					<Label htmlFor={`${idPrefix}-album-title`}>
						Album title <span className="text-destructive">*</span>
					</Label>
					<Input
						id={`${idPrefix}-album-title`}
						value={item.albumTitle}
						disabled={disabled}
						onChange={(event) =>
							onChange({ ...item, albumTitle: event.currentTarget.value })
						}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor={`${idPrefix}-artist-name`}>
						Artist name <span className="text-destructive">*</span>
					</Label>
					<Input
						id={`${idPrefix}-artist-name`}
						value={item.artistName}
						disabled={disabled}
						onChange={(event) =>
							onChange({ ...item, artistName: event.currentTarget.value })
						}
					/>
				</div>
				<ImageUrlField
					id={`${idPrefix}-image-url`}
					label="Album cover URL"
					value={item.imageUrl ?? ""}
					disabled={disabled}
					previewAlt={`${item.albumTitle || "Album"} cover preview`}
					onChange={(imageUrl) => onChange({ ...item, imageUrl })}
					trailingAction={
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={disabled}
							onClick={() => setPickerOpen(true)}
						>
							<Search className="mr-2 h-4 w-4" />
							Choose album
						</Button>
					}
				/>
				<div className="space-y-2 sm:col-span-2">
					<Label htmlFor={`${idPrefix}-pitch`}>Why listen</Label>
					<Textarea
						id={`${idPrefix}-pitch`}
						className="min-h-16"
						value={item.pitch ?? ""}
						disabled={disabled}
						placeholder="10–12 words on why someone should listen."
						onChange={(event) =>
							onChange({ ...item, pitch: event.currentTarget.value })
						}
					/>
				</div>
			</div>
		</div>
	);
}

function ImageUrlField({
	id,
	label,
	value,
	disabled,
	previewAlt,
	onChange,
	trailingAction,
}: {
	id: string;
	label: string;
	value: string;
	disabled: boolean;
	previewAlt: string;
	onChange: (value: string) => void;
	trailingAction?: ReactNode;
}) {
	const previewUrl = value.trim() || undefined;

	return (
		<div className="space-y-2 sm:col-span-2">
			<Label htmlFor={id}>{label}</Label>
			<div className="flex items-end gap-2">
				<Input
					id={id}
					type="url"
					value={value}
					disabled={disabled}
					placeholder="https://…"
					className="min-w-0 flex-1"
					onChange={(event) => onChange(event.currentTarget.value)}
				/>
				{trailingAction}
			</div>
			{previewUrl ? (
				<div className="flex items-center gap-3 rounded-md border bg-muted/30 p-3">
					<img
						src={previewUrl}
						alt={previewAlt}
						className="h-16 w-16 rounded-md object-cover"
					/>
					<div className="min-w-0 text-sm">
						<div className="font-medium">Album art preview</div>
						<div className="text-muted-foreground text-xs">Using image URL</div>
					</div>
				</div>
			) : null}
		</div>
	);
}
