"use client";

import type { ReactElement } from "react";
import type { BookcaseConfig } from "../_utils/geometry";
import {
	type BookcaseMeasurements,
	CONFIG_LIMITS,
	LP_SLEEVE_INCHES,
	formatFeetInches,
	formatInches,
} from "../_utils/geometry";

export function BookcaseControls({
	config,
	measurements,
	onChange,
	onReset,
	collapsed,
	onToggleCollapsed,
}: {
	config: BookcaseConfig;
	measurements: BookcaseMeasurements;
	onChange: (next: BookcaseConfig) => void;
	onReset: () => void;
	collapsed: boolean;
	onToggleCollapsed: () => void;
}): ReactElement {
	const lpNote =
		config.showDividers && measurements.lpClearance < 0.75
			? measurements.lpClearance < 0
				? `Tight — 12″ LPs need ~${formatInches(LP_SLEEVE_INCHES)}`
				: "Just enough for a 12″ sleeve"
			: null;

	return (
		<aside className="pointer-events-auto flex max-h-[calc(100vh-5.25rem)] w-full flex-col border border-[#2a2824]/20 bg-[#1a1815]/94 text-[#ebe6db] shadow-[0_24px_60px_-28px_rgba(20,18,14,0.65)] backdrop-blur-md md:w-[19.5rem]">
			<button
				type="button"
				onClick={onToggleCollapsed}
				className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
			>
				<div>
					<p className="font-[family-name:var(--font-case-mono)] text-[#b7b1a4] text-[0.62rem] uppercase tracking-[0.22em]">
						Spec
					</p>
					<p className="mt-0.5 font-[family-name:var(--font-case-display)] text-2xl leading-none tracking-tight">
						{formatFeetInches(measurements.overallWidth)}
						<span className="mx-1.5 text-[#8a8478]">×</span>
						{formatFeetInches(measurements.overallHeight)}
					</p>
				</div>
				<span className="font-[family-name:var(--font-case-mono)] text-[#9c968a] text-[0.62rem] uppercase tracking-[0.18em]">
					{collapsed ? "Open" : "Hide"}
				</span>
			</button>

			{collapsed ? null : (
				<div className="min-h-0 flex-1 space-y-4 overflow-y-auto border-[#ebe6db]/10 border-t px-4 py-3">
					<dl className="grid grid-cols-2 gap-x-3 gap-y-2 font-[family-name:var(--font-case-mono)] text-[0.7rem] tabular-nums">
						<SpecReadout
							label="Overall W"
							value={formatInches(measurements.overallWidth)}
						/>
						<SpecReadout
							label="Overall H"
							value={formatInches(measurements.overallHeight)}
						/>
						<SpecReadout
							label="One case"
							value={formatInches(measurements.caseWidth)}
						/>
						<SpecReadout
							label="Opening"
							value={formatInches(measurements.openingHeight)}
						/>
						{config.showDividers ? (
							<>
								<SpecReadout
									label="Vinyl □"
									value={formatInches(measurements.vinylBayWidth)}
								/>
								<SpecReadout
									label="Book bay"
									value={formatInches(measurements.bookBayWidth)}
								/>
							</>
						) : (
							<SpecReadout
								label="Shelf span"
								value={formatInches(measurements.innerWidth)}
							/>
						)}
					</dl>

					<Rule />

					<Stepper
						label="Cases"
						value={config.caseCount}
						min={CONFIG_LIMITS.caseCount.min}
						max={CONFIG_LIMITS.caseCount.max}
						onChange={(caseCount) => onChange({ ...config, caseCount })}
					/>
					<Stepper
						label="Shelves"
						value={config.shelfCount}
						min={CONFIG_LIMITS.shelfCount.min}
						max={CONFIG_LIMITS.shelfCount.max}
						onChange={(shelfCount) => onChange({ ...config, shelfCount })}
					/>
					<ToggleRow
						label="Middle separators"
						hint="Square vinyl bay + book bay. Flips each shelf and each case."
						checked={config.showDividers}
						onChange={(showDividers) => onChange({ ...config, showDividers })}
					/>
					<ToggleRow
						label="Show contents"
						hint="Sketch books and records in the openings"
						checked={config.showContents}
						onChange={(showContents) => onChange({ ...config, showContents })}
					/>

					<Rule />

					<InchSlider
						label="Opening height"
						hint="Empty space between shelves"
						value={config.openingHeight}
						min={CONFIG_LIMITS.openingHeight.min}
						max={CONFIG_LIMITS.openingHeight.max}
						step={CONFIG_LIMITS.openingHeight.step}
						onChange={(openingHeight) => onChange({ ...config, openingHeight })}
					/>
					{lpNote ? (
						<p className="font-[family-name:var(--font-case-mono)] text-[#c4b49a] text-[0.62rem] leading-relaxed">
							{lpNote}
						</p>
					) : null}
					<InchSlider
						label="Case inner width"
						hint="Inside the side walls"
						value={config.innerWidth}
						min={CONFIG_LIMITS.innerWidth.min}
						max={CONFIG_LIMITS.innerWidth.max}
						step={CONFIG_LIMITS.innerWidth.step}
						onChange={(innerWidth) => onChange({ ...config, innerWidth })}
					/>

					<Rule />

					<InchSlider
						label="Shelf thickness"
						hint="The boards you set things on"
						value={config.shelfThickness}
						min={CONFIG_LIMITS.shelfThickness.min}
						max={CONFIG_LIMITS.shelfThickness.max}
						step={CONFIG_LIMITS.shelfThickness.step}
						onChange={(shelfThickness) =>
							onChange({ ...config, shelfThickness })
						}
					/>
					<InchSlider
						label="Carcass thickness"
						hint="Outside box — sides, top, bottom"
						value={config.frameThickness}
						min={CONFIG_LIMITS.frameThickness.min}
						max={CONFIG_LIMITS.frameThickness.max}
						step={CONFIG_LIMITS.frameThickness.step}
						onChange={(frameThickness) =>
							onChange({ ...config, frameThickness })
						}
					/>

					<button
						type="button"
						onClick={onReset}
						className="w-full border border-[#ebe6db]/15 px-3 py-2 font-[family-name:var(--font-case-mono)] text-[#d8d3c6] text-[0.62rem] uppercase tracking-[0.2em] transition-colors hover:bg-[#ebe6db]/8"
					>
						Reset to sketch
					</button>
				</div>
			)}
		</aside>
	);
}

function SpecReadout({
	label,
	value,
}: {
	label: string;
	value: string;
}): ReactElement {
	return (
		<div>
			<dt className="text-[#8f897d] text-[0.58rem] uppercase tracking-[0.16em]">
				{label}
			</dt>
			<dd className="mt-0.5 text-[#f3efe6]">{value}</dd>
		</div>
	);
}

function Rule(): ReactElement {
	return <div className="h-px bg-[#ebe6db]/10" />;
}

function Stepper({
	label,
	value,
	min,
	max,
	onChange,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	onChange: (value: number) => void;
}): ReactElement {
	return (
		<div className="flex items-center justify-between gap-3">
			<p className="font-[family-name:var(--font-case-mono)] text-[#b7b1a4] text-[0.62rem] uppercase tracking-[0.18em]">
				{label}
			</p>
			<div className="flex items-center gap-2">
				<button
					type="button"
					aria-label={`Fewer ${label.toLowerCase()}`}
					disabled={value <= min}
					onClick={() => onChange(value - 1)}
					className="size-7 border border-[#ebe6db]/15 font-[family-name:var(--font-case-mono)] text-sm leading-none disabled:opacity-30"
				>
					−
				</button>
				<span className="w-6 text-center font-[family-name:var(--font-case-mono)] text-sm tabular-nums">
					{value}
				</span>
				<button
					type="button"
					aria-label={`More ${label.toLowerCase()}`}
					disabled={value >= max}
					onClick={() => onChange(value + 1)}
					className="size-7 border border-[#ebe6db]/15 font-[family-name:var(--font-case-mono)] text-sm leading-none disabled:opacity-30"
				>
					+
				</button>
			</div>
		</div>
	);
}

function InchSlider({
	label,
	hint,
	value,
	min,
	max,
	step,
	onChange,
}: {
	label: string;
	hint: string;
	value: number;
	min: number;
	max: number;
	step: number;
	onChange: (value: number) => void;
}): ReactElement {
	return (
		<label className="block space-y-1.5">
			<span className="flex items-baseline justify-between gap-3">
				<span className="font-[family-name:var(--font-case-mono)] text-[#b7b1a4] text-[0.62rem] uppercase tracking-[0.18em]">
					{label}
				</span>
				<span className="font-[family-name:var(--font-case-mono)] text-[#f3efe6] text-[0.75rem] tabular-nums">
					{formatInches(value)}
				</span>
			</span>
			<input
				type="range"
				min={min}
				max={max}
				step={step}
				value={value}
				onChange={(event) => onChange(Number(event.target.value))}
				className="case-range w-full"
			/>
			<span className="block font-[family-name:var(--font-case-mono)] text-[#8f897d] text-[0.6rem] leading-relaxed">
				{hint}
			</span>
		</label>
	);
}

function ToggleRow({
	label,
	hint,
	checked,
	onChange,
}: {
	label: string;
	hint: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
}): ReactElement {
	return (
		<button
			type="button"
			onClick={() => onChange(!checked)}
			className="flex w-full items-start justify-between gap-4 text-left"
		>
			<span>
				<span className="block font-[family-name:var(--font-case-mono)] text-[#b7b1a4] text-[0.62rem] uppercase tracking-[0.18em]">
					{label}
				</span>
				<span className="mt-1 block font-[family-name:var(--font-case-mono)] text-[#8f897d] text-[0.6rem] leading-relaxed">
					{hint}
				</span>
			</span>
			<span
				aria-hidden
				className={`mt-0.5 flex h-5 w-9 shrink-0 items-center px-0.5 transition-colors ${
					checked ? "bg-[#ebe6db]" : "bg-[#3a3732]"
				}`}
			>
				<span
					className={`size-4 bg-[#161513] transition-transform ${
						checked ? "translate-x-4" : "translate-x-0"
					}`}
				/>
			</span>
		</button>
	);
}
