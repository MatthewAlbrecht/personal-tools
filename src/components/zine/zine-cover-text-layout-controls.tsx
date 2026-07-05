"use client";

import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import { Label } from "~/components/ui/label";
import { Slider } from "~/components/ui/slider";
import { cn } from "~/lib/utils";
import {
	ZINE_COVER_TEXT_ANCHORS,
	ZINE_COVER_TEXT_OFFSET_SLIDER,
	type ZineCoverTextAlign,
	type ZineCoverTextAnchor,
	type ZineCoverTextLayout,
} from "~/lib/zine/zine-cover-text-layout";

const ANCHOR_LABELS: Record<ZineCoverTextAnchor, string> = {
	"top-left": "Top left",
	"top-center": "Top center",
	"top-right": "Top right",
	"center-left": "Middle left",
	center: "Center",
	"center-right": "Middle right",
	"bottom-left": "Bottom left",
	"bottom-center": "Bottom center",
	"bottom-right": "Bottom right",
};

const TEXT_ALIGNS: ZineCoverTextAlign[] = ["left", "center", "right"];

export function ZineCoverTextLayoutControls({
	layout,
	onLayoutChange,
}: {
	layout: ZineCoverTextLayout;
	onLayoutChange: (layout: ZineCoverTextLayout) => void;
}) {
	function patchLayout(partial: Partial<ZineCoverTextLayout>) {
		onLayoutChange({ ...layout, ...partial });
	}

	return (
		<fieldset className="m-0 space-y-4 border-0 p-0">
			<legend className="mb-2 font-medium text-foreground text-sm leading-snug">
				Title placement
			</legend>
			<p className="text-muted-foreground text-xs leading-snug">
				Position on the front cover · screen preview only
			</p>

			<div className="space-y-2">
				<Label className="text-sm">Position</Label>
				<div className="grid grid-cols-3 gap-1.5">
					{ZINE_COVER_TEXT_ANCHORS.map((anchor) => (
						<button
							key={anchor}
							type="button"
							aria-label={ANCHOR_LABELS[anchor]}
							aria-pressed={layout.anchor === anchor}
							className={cn(
								"aspect-square rounded-md border bg-background transition-colors",
								layout.anchor === anchor
									? "border-primary bg-primary/15 ring-2 ring-primary ring-offset-1 ring-offset-background"
									: "border-border hover:bg-muted/60",
							)}
							onClick={() => patchLayout({ anchor })}
						>
							<span className="sr-only">{ANCHOR_LABELS[anchor]}</span>
						</button>
					))}
				</div>
			</div>

			<div className="space-y-2">
				<Label className="text-sm">Text alignment</Label>
				<div className="flex gap-1.5">
					{TEXT_ALIGNS.map((textAlign) => (
						<button
							key={textAlign}
							type="button"
							aria-label={
								textAlign === "left"
									? "Align left"
									: textAlign === "center"
										? "Align center"
										: "Align right"
							}
							aria-pressed={layout.textAlign === textAlign}
							className={cn(
								"flex h-9 flex-1 items-center justify-center rounded-md border bg-background transition-colors",
								layout.textAlign === textAlign
									? "border-primary bg-primary/15 ring-2 ring-primary ring-offset-1 ring-offset-background"
									: "border-border hover:bg-muted/60",
							)}
							onClick={() => patchLayout({ textAlign })}
						>
							{textAlign === "left" ? (
								<AlignLeft className="h-4 w-4" />
							) : textAlign === "center" ? (
								<AlignCenter className="h-4 w-4" />
							) : (
								<AlignRight className="h-4 w-4" />
							)}
						</button>
					))}
				</div>
			</div>

			<div className="space-y-2">
				<div className="flex items-baseline justify-between gap-3">
					<Label htmlFor="zine-cover-offset-x" className="text-sm">
						Nudge horizontal
					</Label>
					<span
						aria-live="polite"
						className="text-muted-foreground text-xs tabular-nums"
					>
						{formatOffsetInches(layout.offsetXIn)}
					</span>
				</div>
				<div className="px-1 pt-0.5 pb-1">
					<Slider
						id="zine-cover-offset-x"
						max={ZINE_COVER_TEXT_OFFSET_SLIDER.maxIn}
						min={ZINE_COVER_TEXT_OFFSET_SLIDER.minIn}
						step={ZINE_COVER_TEXT_OFFSET_SLIDER.stepIn}
						value={[layout.offsetXIn]}
						onValueChange={(values) => {
							const next = values[0];
							if (next !== undefined) {
								patchLayout({ offsetXIn: next });
							}
						}}
					/>
				</div>
			</div>

			<div className="space-y-2">
				<div className="flex items-baseline justify-between gap-3">
					<Label htmlFor="zine-cover-offset-y" className="text-sm">
						Nudge vertical
					</Label>
					<span
						aria-live="polite"
						className="text-muted-foreground text-xs tabular-nums"
					>
						{formatOffsetInches(layout.offsetYIn)}
					</span>
				</div>
				<div className="px-1 pt-0.5 pb-1">
					<Slider
						id="zine-cover-offset-y"
						max={ZINE_COVER_TEXT_OFFSET_SLIDER.maxIn}
						min={ZINE_COVER_TEXT_OFFSET_SLIDER.minIn}
						step={ZINE_COVER_TEXT_OFFSET_SLIDER.stepIn}
						value={[layout.offsetYIn]}
						onValueChange={(values) => {
							const next = values[0];
							if (next !== undefined) {
								patchLayout({ offsetYIn: next });
							}
						}}
					/>
				</div>
			</div>
		</fieldset>
	);
}

function formatOffsetInches(value: number): string {
	return `${value.toFixed(2)}"`;
}
