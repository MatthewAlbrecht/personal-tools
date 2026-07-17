"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
	Combobox,
	ComboboxChips,
	ComboboxChipsInput,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxItem,
	ComboboxList,
	useComboboxAnchor,
} from "~/components/ui/combobox";
import { resolveComboboxFilteredItems } from "~/components/ui/combobox-filter";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import type { GenreClause, GenreRole } from "~/lib/smart-playlists/types";
import { cn } from "~/lib/utils";

export function GenreClauseList({
	genreOptions,
	clauses,
	genreMatch,
	onChange,
}: {
	genreOptions: Array<{ key: string; label: string }>;
	clauses: GenreClause[];
	genreMatch: "all" | "any";
	onChange: (next: {
		genreClauses: GenreClause[];
		genreMatch: "all" | "any";
	}) => void;
}): React.ReactNode {
	const [genreInput, setGenreInput] = useState("");
	const genreAnchor = useComboboxAnchor();

	const genreKeysPool = genreOptions.map((option) => option.key);
	const labelByKey = new Map(
		genreOptions.map((option) => [option.key, option.label] as const),
	);

	function formatGenreOption(key: string): string {
		return labelByKey.get(key) ?? key;
	}

	const genreList = resolveComboboxFilteredItems({
		items: genreKeysPool,
		filter: genreInput,
		getItemLabel: formatGenreOption,
	});

	function focusCombobox(): void {
		genreAnchor.current?.querySelector("input")?.focus();
	}

	function handleComboboxValueChange(selected: string[]): void {
		setGenreInput("");
		const genreKey = selected[selected.length - 1];
		if (!genreKey) return;
		if (clauses.some((clause) => clause.genreKey === genreKey)) return;

		onChange({
			genreClauses: [
				...clauses,
				{ genreKey, mode: "include", role: "primary" },
			],
			genreMatch,
		});
	}

	function updateClause(genreKey: string, patch: Partial<GenreClause>): void {
		onChange({
			genreClauses: clauses.map((clause) =>
				clause.genreKey === genreKey ? { ...clause, ...patch } : clause,
			),
			genreMatch,
		});
	}

	function removeClause(genreKey: string): void {
		onChange({
			genreClauses: clauses.filter((clause) => clause.genreKey !== genreKey),
			genreMatch,
		});
	}

	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<Label htmlFor="genre-clause-combobox">Genres</Label>
				<fieldset className="m-0 inline-flex rounded-md border border-border bg-background px-0.5 py-0.5">
					<SegmentButton
						active={genreMatch === "any"}
						onClick={() =>
							onChange({ genreClauses: clauses, genreMatch: "any" })
						}
					>
						Any
					</SegmentButton>
					<SegmentButton
						active={genreMatch === "all"}
						onClick={() =>
							onChange({ genreClauses: clauses, genreMatch: "all" })
						}
					>
						All
					</SegmentButton>
				</fieldset>
			</div>

			<Combobox
				items={genreKeysPool}
				filteredItems={genreList.filteredItems}
				inputValue={genreInput}
				onInputValueChange={(next) => setGenreInput(next)}
				multiple
				itemToStringLabel={formatGenreOption}
				value={[]}
				onValueChange={handleComboboxValueChange}
			>
				<ComboboxChips ref={genreAnchor}>
					<ComboboxChipsInput
						id="genre-clause-combobox"
						placeholder="Add genre"
					/>
				</ComboboxChips>
				<ComboboxContent anchor={genreAnchor}>
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

			{clauses.length > 0 ? (
				<ul className="flex flex-col gap-1.5 pt-1">
					{clauses.map((clause) => (
						<GenreClauseRow
							key={clause.genreKey}
							clause={clause}
							label={formatGenreOption(clause.genreKey)}
							onModeChange={(mode) => updateClause(clause.genreKey, { mode })}
							onRoleChange={(role) => updateClause(clause.genreKey, { role })}
							onRemove={() => removeClause(clause.genreKey)}
						/>
					))}
				</ul>
			) : null}

			<Button
				type="button"
				variant="outline"
				size="sm"
				className="w-fit"
				onClick={focusCombobox}
			>
				<Plus className="size-4" />
				Add another genre filter
			</Button>
		</div>
	);
}

function GenreClauseRow({
	clause,
	label,
	onModeChange,
	onRoleChange,
	onRemove,
}: {
	clause: GenreClause;
	label: string;
	onModeChange: (mode: GenreClause["mode"]) => void;
	onRoleChange: (role: GenreRole) => void;
	onRemove: () => void;
}): React.ReactNode {
	return (
		<li className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
			<span className="min-w-0 flex-1 truncate font-medium text-sm">
				{label}
			</span>
			<Select
				value={clause.mode}
				onValueChange={(value) => onModeChange(value as GenreClause["mode"])}
			>
				<SelectTrigger size="sm" className="w-[110px]">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="include">Include</SelectItem>
					<SelectItem value="exclude">Exclude</SelectItem>
				</SelectContent>
			</Select>
			<Select
				value={clause.role}
				onValueChange={(value) => onRoleChange(value as GenreRole)}
			>
				<SelectTrigger size="sm" className="w-[130px]">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="primary">Primary</SelectItem>
					<SelectItem value="secondary">Secondary</SelectItem>
					<SelectItem value="either">Either</SelectItem>
				</SelectContent>
			</Select>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				className="size-8 shrink-0"
				aria-label={`Remove ${label} genre filter`}
				onClick={onRemove}
			>
				<Trash2 className="size-4" />
			</Button>
		</li>
	);
}

function SegmentButton({
	active,
	onClick,
	children,
}: {
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
}): React.ReactNode {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"rounded px-2.5 py-1 font-medium text-sm",
				active
					? "bg-muted shadow-sm"
					: "text-muted-foreground hover:text-foreground",
			)}
		>
			{children}
		</button>
	);
}
