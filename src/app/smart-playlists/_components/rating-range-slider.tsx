"use client";

import { Label } from "~/components/ui/label";
import { Slider } from "~/components/ui/slider";
import { getTierLabel } from "~/lib/album-tiers";

export function RatingRangeSlider({
	ratingMin,
	ratingMax,
	onChange,
}: {
	ratingMin: number;
	ratingMax: number;
	onChange: (next: { ratingMin: number; ratingMax: number }) => void;
}): React.ReactNode {
	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between gap-2">
				<Label>Rating</Label>
				<p className="text-muted-foreground text-xs">
					{getTierLabel(ratingMin)} → {getTierLabel(ratingMax)}
				</p>
			</div>
			<Slider
				min={1}
				max={15}
				step={1}
				value={[ratingMin, ratingMax]}
				onValueChange={(value) => {
					const low = value[0] ?? 1;
					const high = value[1] ?? 15;
					onChange({
						ratingMin: Math.min(low, high),
						ratingMax: Math.max(low, high),
					});
				}}
			/>
		</div>
	);
}
