"use client";

import { useForm } from "@tanstack/react-form";
import { Columns2, Columns3, Columns4 } from "lucide-react";
import type * as React from "react";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { saveCardGridColumns } from "~/lib/hooks/use-card-grid-columns";
import { cn } from "~/lib/utils";
import { GRID_COLUMNS, type GridColumns } from "~/lib/yugioh/card-grid";
import { gridColumnsSchema } from "../_utils/schemas";

const ICONS: Record<GridColumns, typeof Columns2> = {
	2: Columns2,
	3: Columns3,
	4: Columns4,
};

/**
 * 2 / 3 / 4 columns for the Cards grid, saved on this device. `value` is the
 * columns shown; a phone hides 4 (the grid clamps it to 3 there).
 */
export function GridColumnsToggle({
	value,
}: {
	value: GridColumns;
}): React.ReactElement {
	const form = useForm({
		defaultValues: { columns: value },
		validators: { onSubmit: gridColumnsSchema },
		onSubmit: ({ value: next }) => {
			saveCardGridColumns(next.columns);
		},
	});

	return (
		<form.Field name="columns">
			{(field) => (
				<ToggleGroup
					aria-label="Columns"
					variant="outline"
					spacing={0}
					value={[String(value)]}
					onValueChange={(next) => {
						const picked = Number(next[0]) as GridColumns;
						// Pressing the active option again would clear the group; keep it.
						if (!picked || picked === value) return;
						field.handleChange(picked);
						void form.handleSubmit();
					}}
				>
					{GRID_COLUMNS.map((columns) => {
						const Icon = ICONS[columns];
						return (
							<ToggleGroupItem
								key={columns}
								value={String(columns)}
								aria-label={`${columns} columns`}
								title={`${columns} columns`}
								className={cn(
									"h-11 w-11 md:h-9 md:w-9",
									columns === 4 && "max-sm:hidden",
								)}
							>
								<Icon />
							</ToggleGroupItem>
						);
					})}
				</ToggleGroup>
			)}
		</form.Field>
	);
}
