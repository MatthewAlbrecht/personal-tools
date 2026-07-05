"use client";

import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import {
	ZINE_INSIDE_BACK_DEFAULT_TITLES,
	ZINE_INSIDE_BACK_LIMITS,
	type ZineDiscographyItem,
	type ZineInsideBackSection,
	type ZineRecommendationItem,
} from "~/lib/zine/zine-inside-back-sections";

type SectionType = ZineInsideBackSection["type"];

function createEmptySection(type: SectionType): ZineInsideBackSection {
	return type === "discography"
		? { type: "discography", items: [{ albumTitle: "", blurb: "" }] }
		: { type: "recommendations", items: [{ albumTitle: "", artistName: "" }] };
}

function moveAdjacent<T>(
	items: T[],
	index: number,
	direction: "up" | "down",
): T[] {
	const targetIndex = direction === "up" ? index - 1 : index + 1;
	if (targetIndex < 0 || targetIndex >= items.length) {
		return items;
	}

	const next = [...items];
	const current = next[index];
	const adjacent = next[targetIndex];
	if (current === undefined || adjacent === undefined) {
		return items;
	}

	next[index] = adjacent;
	next[targetIndex] = current;
	return next;
}

function getMaxItemsForSection(section: ZineInsideBackSection): number {
	return section.type === "discography"
		? ZINE_INSIDE_BACK_LIMITS.maxDiscographyItems
		: ZINE_INSIDE_BACK_LIMITS.maxRecommendationItems;
}

function getSectionTypeLabel(type: SectionType): string {
	return type === "discography" ? "Discography" : "Recommendations";
}

export function ZineInsideBackSectionsEditor({
	sections,
	onChange,
	disabled = false,
}: {
	sections: ZineInsideBackSection[];
	onChange: (sections: ZineInsideBackSection[]) => void;
	disabled?: boolean;
}) {
	const [sectionTypeToAdd, setSectionTypeToAdd] =
		useState<SectionType>("discography");
	const atMaxSections = sections.length >= ZINE_INSIDE_BACK_LIMITS.maxSections;

	function handleAddSection(): void {
		if (disabled || atMaxSections) {
			return;
		}

		onChange([...sections, createEmptySection(sectionTypeToAdd)]);
	}

	function handleRemoveSection(sectionIndex: number): void {
		onChange(sections.filter((_, index) => index !== sectionIndex));
	}

	function handleMoveSection(
		sectionIndex: number,
		direction: "up" | "down",
	): void {
		onChange(moveAdjacent(sections, sectionIndex, direction));
	}

	function handleSectionTitleChange(sectionIndex: number, title: string): void {
		onChange(
			sections.map((section, index) =>
				index === sectionIndex ? { ...section, title } : section,
			),
		);
	}

	function handleSectionItemsChange(
		sectionIndex: number,
		items: ZineDiscographyItem[] | ZineRecommendationItem[],
	): void {
		onChange(
			sections.map((section, index) => {
				if (index !== sectionIndex) {
					return section;
				}

				if (section.type === "discography") {
					return { ...section, items: items as ZineDiscographyItem[] };
				}

				return { ...section, items: items as ZineRecommendationItem[] };
			}),
		);
	}

	return (
		<div className="space-y-4">
			{sections.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					No sections yet. Add a discography or recommendations section for the
					inside back cover.
				</p>
			) : null}

			{sections.map((section, sectionIndex) => (
				<InsideBackSectionCard
					key={`${section.type}-${sectionIndex}`}
					section={section}
					sectionIndex={sectionIndex}
					sectionCount={sections.length}
					disabled={disabled}
					onTitleChange={(title) =>
						handleSectionTitleChange(sectionIndex, title)
					}
					onMove={(direction) => handleMoveSection(sectionIndex, direction)}
					onRemove={() => handleRemoveSection(sectionIndex)}
					onItemsChange={(items) =>
						handleSectionItemsChange(sectionIndex, items)
					}
				/>
			))}

			<div className="flex flex-wrap items-end gap-2">
				<div className="space-y-2">
					<Label htmlFor="inside-back-section-type">Section type</Label>
					<Select
						value={sectionTypeToAdd}
						disabled={disabled || atMaxSections}
						onValueChange={(value) => setSectionTypeToAdd(value as SectionType)}
					>
						<SelectTrigger id="inside-back-section-type" className="w-[200px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="discography">Discography</SelectItem>
							<SelectItem value="recommendations">Recommendations</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<Button
					type="button"
					variant="outline"
					disabled={disabled || atMaxSections}
					onClick={handleAddSection}
				>
					<Plus className="h-4 w-4" />
					Add section
				</Button>
			</div>

			{atMaxSections ? (
				<p className="text-muted-foreground text-xs">
					Maximum of {ZINE_INSIDE_BACK_LIMITS.maxSections} sections reached.
				</p>
			) : null}
		</div>
	);
}

function InsideBackSectionCard({
	section,
	sectionIndex,
	sectionCount,
	disabled,
	onTitleChange,
	onMove,
	onRemove,
	onItemsChange,
}: {
	section: ZineInsideBackSection;
	sectionIndex: number;
	sectionCount: number;
	disabled: boolean;
	onTitleChange: (title: string) => void;
	onMove: (direction: "up" | "down") => void;
	onRemove: () => void;
	onItemsChange: (
		items: ZineDiscographyItem[] | ZineRecommendationItem[],
	) => void;
}) {
	const defaultTitle =
		section.type === "discography"
			? ZINE_INSIDE_BACK_DEFAULT_TITLES.discography
			: ZINE_INSIDE_BACK_DEFAULT_TITLES.recommendations;
	const maxItems = getMaxItemsForSection(section);
	const atMaxItems = section.items.length >= maxItems;

	function handleAddItem(): void {
		if (disabled || atMaxItems) {
			return;
		}

		if (section.type === "discography") {
			const items = section.items as ZineDiscographyItem[];
			onItemsChange([...items, { albumTitle: "", blurb: "" }]);
			return;
		}

		const items = section.items as ZineRecommendationItem[];
		onItemsChange([...items, { albumTitle: "", artistName: "" }]);
	}

	function handleRemoveItem(itemIndex: number): void {
		if (section.type === "discography") {
			const items = section.items as ZineDiscographyItem[];
			onItemsChange(items.filter((_, index) => index !== itemIndex));
			return;
		}

		const items = section.items as ZineRecommendationItem[];
		onItemsChange(items.filter((_, index) => index !== itemIndex));
	}

	function handleMoveItem(itemIndex: number, direction: "up" | "down"): void {
		if (section.type === "discography") {
			const items = section.items as ZineDiscographyItem[];
			onItemsChange(moveAdjacent(items, itemIndex, direction));
			return;
		}

		const items = section.items as ZineRecommendationItem[];
		onItemsChange(moveAdjacent(items, itemIndex, direction));
	}

	return (
		<div className="space-y-4 rounded-lg border bg-muted/20 p-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0 flex-1 space-y-1">
					<p className="font-medium text-sm">
						{getSectionTypeLabel(section.type)} · Section {sectionIndex + 1}
					</p>
					<p className="text-muted-foreground text-xs">
						Default title: {defaultTitle}
					</p>
				</div>
				<div className="flex shrink-0 gap-1">
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={disabled || sectionIndex === 0}
						onClick={() => onMove("up")}
						aria-label="Move section up"
					>
						<ChevronUp className="h-4 w-4" />
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={disabled || sectionIndex >= sectionCount - 1}
						onClick={() => onMove("down")}
						aria-label="Move section down"
					>
						<ChevronDown className="h-4 w-4" />
					</Button>
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
			</div>

			<div className="space-y-2">
				<Label htmlFor={`inside-back-section-title-${sectionIndex}`}>
					Section title override
				</Label>
				<Input
					id={`inside-back-section-title-${sectionIndex}`}
					value={section.title ?? ""}
					disabled={disabled}
					placeholder={defaultTitle}
					onChange={(event) => onTitleChange(event.currentTarget.value)}
				/>
			</div>

			<div className="space-y-3">
				{section.type === "discography"
					? section.items.map((item, itemIndex) => (
							<DiscographyItemEditor
								key={`discography-item-${sectionIndex}-${itemIndex}`}
								item={item}
								itemIndex={itemIndex}
								itemCount={section.items.length}
								sectionIndex={sectionIndex}
								disabled={disabled}
								onChange={(nextItem) => {
									onItemsChange(
										section.items.map((current, index) =>
											index === itemIndex ? nextItem : current,
										),
									);
								}}
								onMove={(direction) => handleMoveItem(itemIndex, direction)}
								onRemove={() => handleRemoveItem(itemIndex)}
							/>
						))
					: section.items.map((item, itemIndex) => (
							<RecommendationItemEditor
								key={`recommendations-item-${sectionIndex}-${itemIndex}`}
								item={item}
								itemIndex={itemIndex}
								itemCount={section.items.length}
								sectionIndex={sectionIndex}
								disabled={disabled}
								onChange={(nextItem) => {
									onItemsChange(
										section.items.map((current, index) =>
											index === itemIndex ? nextItem : current,
										),
									);
								}}
								onMove={(direction) => handleMoveItem(itemIndex, direction)}
								onRemove={() => handleRemoveItem(itemIndex)}
							/>
						))}
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={disabled || atMaxItems}
					onClick={handleAddItem}
				>
					<Plus className="h-4 w-4" />
					Add item
				</Button>
				<p className="text-muted-foreground text-xs">
					{section.items.length} / {maxItems} items
				</p>
			</div>
		</div>
	);
}

function DiscographyItemEditor({
	item,
	itemIndex,
	itemCount,
	sectionIndex,
	disabled,
	onChange,
	onMove,
	onRemove,
}: {
	item: ZineDiscographyItem;
	itemIndex: number;
	itemCount: number;
	sectionIndex: number;
	disabled: boolean;
	onChange: (item: ZineDiscographyItem) => void;
	onMove: (direction: "up" | "down") => void;
	onRemove: () => void;
}) {
	const idPrefix = `inside-back-discography-${sectionIndex}-${itemIndex}`;

	return (
		<ItemEditorShell
			label={`Discography item ${itemIndex + 1}`}
			itemIndex={itemIndex}
			itemCount={itemCount}
			disabled={disabled}
			onMove={onMove}
			onRemove={onRemove}
		>
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
					<Label htmlFor={`${idPrefix}-artist-name`}>Artist name</Label>
					<Input
						id={`${idPrefix}-artist-name`}
						value={item.artistName ?? ""}
						disabled={disabled}
						onChange={(event) =>
							onChange({ ...item, artistName: event.currentTarget.value })
						}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor={`${idPrefix}-year`}>Year</Label>
					<Input
						id={`${idPrefix}-year`}
						value={item.year ?? ""}
						disabled={disabled}
						onChange={(event) =>
							onChange({ ...item, year: event.currentTarget.value })
						}
					/>
				</div>
				<ImageUrlField
					id={`${idPrefix}-image-url`}
					label="Image URL"
					value={item.imageUrl ?? ""}
					disabled={disabled}
					previewAlt={`${item.albumTitle || "Album"} cover preview`}
					onChange={(imageUrl) => onChange({ ...item, imageUrl })}
				/>
				<div className="space-y-2 sm:col-span-2">
					<Label htmlFor={`${idPrefix}-blurb`}>
						Blurb <span className="text-destructive">*</span>
					</Label>
					<Textarea
						id={`${idPrefix}-blurb`}
						className="min-h-20"
						value={item.blurb}
						disabled={disabled}
						placeholder="One sentence about this album."
						onChange={(event) =>
							onChange({ ...item, blurb: event.currentTarget.value })
						}
					/>
				</div>
			</div>
		</ItemEditorShell>
	);
}

function RecommendationItemEditor({
	item,
	itemIndex,
	itemCount,
	sectionIndex,
	disabled,
	onChange,
	onMove,
	onRemove,
}: {
	item: ZineRecommendationItem;
	itemIndex: number;
	itemCount: number;
	sectionIndex: number;
	disabled: boolean;
	onChange: (item: ZineRecommendationItem) => void;
	onMove: (direction: "up" | "down") => void;
	onRemove: () => void;
}) {
	const idPrefix = `inside-back-recommendations-${sectionIndex}-${itemIndex}`;

	return (
		<ItemEditorShell
			label={`Recommendation ${itemIndex + 1}`}
			itemIndex={itemIndex}
			itemCount={itemCount}
			disabled={disabled}
			onMove={onMove}
			onRemove={onRemove}
		>
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
				<div className="space-y-2 sm:col-span-2">
					<ImageUrlField
						id={`${idPrefix}-image-url`}
						label="Image URL"
						value={item.imageUrl ?? ""}
						disabled={disabled}
						previewAlt={`${item.albumTitle || "Album"} cover preview`}
						onChange={(imageUrl) => onChange({ ...item, imageUrl })}
					/>
				</div>
				<div className="space-y-2 sm:col-span-2">
					<Label htmlFor={`${idPrefix}-similarity-blurb`}>
						Similarity blurb
					</Label>
					<Textarea
						id={`${idPrefix}-similarity-blurb`}
						className="min-h-20"
						value={item.similarityBlurb ?? ""}
						disabled={disabled}
						placeholder="Optional note on shared vibe."
						onChange={(event) =>
							onChange({ ...item, similarityBlurb: event.currentTarget.value })
						}
					/>
				</div>
			</div>
		</ItemEditorShell>
	);
}

function ItemEditorShell({
	label,
	itemIndex,
	itemCount,
	disabled,
	onMove,
	onRemove,
	children,
}: {
	label: string;
	itemIndex: number;
	itemCount: number;
	disabled: boolean;
	onMove: (direction: "up" | "down") => void;
	onRemove: () => void;
	children: ReactNode;
}) {
	return (
		<div className="space-y-3 rounded-md border bg-background p-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="font-medium text-sm">{label}</p>
				<div className="flex gap-1">
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={disabled || itemIndex === 0}
						onClick={() => onMove("up")}
						aria-label={`Move ${label} up`}
					>
						<ChevronUp className="h-4 w-4" />
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={disabled || itemIndex >= itemCount - 1}
						onClick={() => onMove("down")}
						aria-label={`Move ${label} down`}
					>
						<ChevronDown className="h-4 w-4" />
					</Button>
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
			</div>
			{children}
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
}: {
	id: string;
	label: string;
	value: string;
	disabled: boolean;
	previewAlt: string;
	onChange: (value: string) => void;
}) {
	const previewUrl = value.trim() || undefined;

	return (
		<div className="space-y-2 sm:col-span-2">
			<Label htmlFor={id}>{label}</Label>
			<Input
				id={id}
				type="url"
				value={value}
				disabled={disabled}
				placeholder="https://…"
				onChange={(event) => onChange(event.currentTarget.value)}
			/>
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
