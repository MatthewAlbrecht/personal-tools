"use client";

import { Label } from "~/components/ui/label";
import { Slider } from "~/components/ui/slider";
import {
	DURATION_SLIDER_MAX_INDEX,
	type DurationFilterPatch,
	durationFiltersFromIndices,
	formatDurationHandleLabel,
	indicesFromDurationFilters,
} from "~/lib/smart-playlists/duration-slider";

export function DurationRangeSlider({
	durationOpenLow,
	durationOpenHigh,
	durationMinMinutes,
	durationMaxMinutes,
	onChange,
}: {
	durationOpenLow?: boolean;
	durationOpenHigh?: boolean;
	durationMinMinutes?: number;
	durationMaxMinutes?: number;
	onChange: (next: DurationFilterPatch) => void;
}): React.ReactNode {
	const [lowIndex, highIndex] = indicesFromDurationFilters({
		durationOpenLow,
		durationOpenHigh,
		durationMinMinutes,
		durationMaxMinutes,
	});

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between gap-2">
				<Label>Duration</Label>
				<p className="text-muted-foreground text-xs">
					{formatDurationHandleLabel(lowIndex)} →{" "}
					{formatDurationHandleLabel(highIndex)}
				</p>
			</div>
			<Slider
				min={0}
				max={DURATION_SLIDER_MAX_INDEX}
				step={1}
				value={[lowIndex, highIndex]}
				onValueChange={(value) => {
					const low = value[0] ?? 0;
					const high = value[1] ?? DURATION_SLIDER_MAX_INDEX;
					onChange(durationFiltersFromIndices(low, high));
				}}
			/>
		</div>
	);
}
