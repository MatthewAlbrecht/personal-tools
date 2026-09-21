"use client";

import type { ReactElement } from "react";
import { fillBookBay } from "../_utils/contents";
import {
	type BookcaseConfig,
	type BookcaseMeasurements,
	formatInches,
	isVinylOnLeft,
	openingTop,
} from "../_utils/geometry";

export function BookcaseElevation({
	config,
	measurements,
	pixelsPerInch,
}: {
	config: BookcaseConfig;
	measurements: BookcaseMeasurements;
	pixelsPerInch: number;
}): ReactElement {
	const { caseWidth, caseHeight, overallWidth, overallHeight } = measurements;
	const labelSize = 11 / pixelsPerInch;
	const dimStroke = 1.15 / pixelsPerInch;

	return (
		<g>
			{Array.from({ length: config.caseCount }, (_, caseIndex) => (
				<CaseElevation
					key={caseIndex}
					caseIndex={caseIndex}
					config={config}
					measurements={measurements}
					x={caseIndex * caseWidth}
				/>
			))}

			<DimensionLine
				x1={0}
				y1={overallHeight + 2.1}
				x2={overallWidth}
				y2={overallHeight + 2.1}
				label={`X  ${formatInches(overallWidth)}`}
				fontSize={labelSize}
				strokeWidth={dimStroke}
			/>
			<DimensionLine
				x1={overallWidth + 2.1}
				y1={0}
				x2={overallWidth + 2.1}
				y2={overallHeight}
				label={`Y  ${formatInches(overallHeight)}`}
				fontSize={labelSize}
				strokeWidth={dimStroke}
			/>
			<DimensionLine
				x1={-2.1}
				y1={openingTop(config, 0)}
				x2={-2.1}
				y2={openingTop(config, 0) + config.openingHeight}
				label={formatInches(config.openingHeight)}
				fontSize={labelSize}
				strokeWidth={dimStroke}
			/>
			{config.showDividers && measurements.vinylBayWidth > 0 ? (
				<DimensionLine
					x1={config.frameThickness}
					y1={-1.7}
					x2={config.frameThickness + measurements.vinylBayWidth}
					y2={-1.7}
					label={`□ ${formatInches(measurements.vinylBayWidth)}`}
					fontSize={labelSize}
					strokeWidth={dimStroke}
				/>
			) : null}

			<line
				x1={0}
				y1={caseHeight}
				x2={0}
				y2={overallHeight + 2.1}
				stroke="#5c5850"
				strokeWidth={dimStroke}
			/>
			<line
				x1={overallWidth}
				y1={caseHeight}
				x2={overallWidth}
				y2={overallHeight + 2.1}
				stroke="#5c5850"
				strokeWidth={dimStroke}
			/>
		</g>
	);
}

function CaseElevation({
	caseIndex,
	config,
	measurements,
	x,
}: {
	caseIndex: number;
	config: BookcaseConfig;
	measurements: BookcaseMeasurements;
	x: number;
}): ReactElement {
	const { caseWidth, caseHeight, vinylBayWidth, bookBayWidth } = measurements;
	const frame = config.frameThickness;
	const innerX = x + frame;

	return (
		<g>
			<rect
				x={innerX}
				y={frame}
				width={config.innerWidth}
				height={caseHeight - 2 * frame}
				fill="#e4dccb"
			/>

			{Array.from({ length: config.shelfCount }, (_, shelfIndex) => {
				const y = openingTop(config, shelfIndex);
				const vinylLeft = isVinylOnLeft(caseIndex, shelfIndex);
				const vinylX = vinylLeft
					? innerX
					: innerX + bookBayWidth + config.shelfThickness;
				const bookX = vinylLeft
					? innerX + vinylBayWidth + config.shelfThickness
					: innerX;

				return (
					<g key={shelfIndex}>
						{config.showDividers && vinylBayWidth > 0 ? (
							<>
								<BayContents
									x={vinylX}
									y={y}
									width={vinylBayWidth}
									height={config.openingHeight}
									kind="vinyl"
									seed={caseIndex * 97 + shelfIndex * 13 + 3}
									visible={config.showContents}
								/>
								<BayContents
									x={bookX}
									y={y}
									width={bookBayWidth}
									height={config.openingHeight}
									kind="book"
									seed={caseIndex * 53 + shelfIndex * 17 + 11}
									visible={config.showContents}
								/>
								<rect
									x={vinylLeft ? innerX + vinylBayWidth : innerX + bookBayWidth}
									y={y}
									width={config.shelfThickness}
									height={config.openingHeight}
									fill="#8d8778"
									stroke="#2a2722"
									strokeWidth={0.07}
								/>
							</>
						) : (
							<BayContents
								x={innerX}
								y={y}
								width={config.innerWidth}
								height={config.openingHeight}
								kind="book"
								seed={caseIndex * 53 + shelfIndex * 17 + 11}
								visible={config.showContents}
							/>
						)}
					</g>
				);
			})}

			{Array.from(
				{ length: Math.max(0, config.shelfCount - 1) },
				(_, index) => {
					const y = openingTop(config, index) + config.openingHeight;
					return (
						<rect
							key={`shelf-${index}`}
							x={innerX}
							y={y}
							width={config.innerWidth}
							height={config.shelfThickness}
							fill="#9a9486"
							stroke="#2a2722"
							strokeWidth={0.07}
						/>
					);
				},
			)}

			<rect
				x={x}
				y={0}
				width={frame}
				height={caseHeight}
				fill="#7f796c"
				stroke="#2a2722"
				strokeWidth={0.08}
			/>
			<rect
				x={x + caseWidth - frame}
				y={0}
				width={frame}
				height={caseHeight}
				fill="#7f796c"
				stroke="#2a2722"
				strokeWidth={0.08}
			/>
			<rect
				x={innerX}
				y={0}
				width={config.innerWidth}
				height={frame}
				fill="#8f897b"
				stroke="#2a2722"
				strokeWidth={0.08}
			/>
			<rect
				x={innerX}
				y={caseHeight - frame}
				width={config.innerWidth}
				height={frame}
				fill="#8f897b"
				stroke="#2a2722"
				strokeWidth={0.08}
			/>
		</g>
	);
}

function BayContents({
	x,
	y,
	width,
	height,
	kind,
	seed,
	visible,
}: {
	x: number;
	y: number;
	width: number;
	height: number;
	kind: "book" | "vinyl";
	seed: number;
	visible: boolean;
}): ReactElement | null {
	if (!visible) return null;
	const floor = 0.08;

	if (kind === "vinyl") {
		const inset = 0.22;
		const face = Math.max(0.6, Math.min(width, height) - inset * 2);
		const faceX = x + (width - face) / 2;
		const faceY = y + height - floor - face;
		return (
			<g>
				<rect x={x} y={y} width={width} height={height} fill="#d8d2c4" />
				<rect x={faceX} y={faceY} width={face} height={face} fill="#3d3b36" />
				<rect
					x={faceX + face * 0.14}
					y={faceY + face * 0.14}
					width={face * 0.72}
					height={face * 0.72}
					fill="#5c584f"
				/>
				<rect
					x={faceX + face * 0.36}
					y={faceY + face * 0.36}
					width={face * 0.28}
					height={face * 0.28}
					fill="#2c2a26"
				/>
			</g>
		);
	}

	const spines = fillBookBay(width, height, seed);
	return (
		<g>
			{spines.map((spine, index) => {
				const tone = Math.round(32 + spine.tone * 140);
				const fill = `rgb(${tone} ${tone - 1} ${tone - 5})`;
				return (
					<rect
						key={`${kind}-${index}`}
						x={x + spine.x}
						y={y + height - floor - spine.height}
						width={spine.width}
						height={spine.height}
						fill={fill}
					/>
				);
			})}
		</g>
	);
}

function DimensionLine({
	x1,
	y1,
	x2,
	y2,
	label,
	fontSize,
	strokeWidth,
}: {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	label: string;
	fontSize: number;
	strokeWidth: number;
}): ReactElement {
	const horizontal = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
	const tick = 0.42;
	const midX = (x1 + x2) / 2;
	const midY = (y1 + y2) / 2;

	return (
		<g className="pointer-events-none">
			<line
				x1={x1}
				y1={y1}
				x2={x2}
				y2={y2}
				stroke="#5c5850"
				strokeWidth={strokeWidth}
			/>
			{horizontal ? (
				<>
					<line
						x1={x1}
						y1={y1 - tick}
						x2={x1}
						y2={y1 + tick}
						stroke="#5c5850"
						strokeWidth={strokeWidth}
					/>
					<line
						x1={x2}
						y1={y2 - tick}
						x2={x2}
						y2={y2 + tick}
						stroke="#5c5850"
						strokeWidth={strokeWidth}
					/>
				</>
			) : (
				<>
					<line
						x1={x1 - tick}
						y1={y1}
						x2={x1 + tick}
						y2={y1}
						stroke="#5c5850"
						strokeWidth={strokeWidth}
					/>
					<line
						x1={x2 - tick}
						y1={y2}
						x2={x2 + tick}
						y2={y2}
						stroke="#5c5850"
						strokeWidth={strokeWidth}
					/>
				</>
			)}
			<text
				x={horizontal ? midX : midX + fontSize * 0.15}
				y={horizontal ? midY - fontSize * 0.35 : midY}
				fill="#3f3c36"
				fontSize={fontSize}
				fontFamily="var(--font-case-mono), ui-monospace, monospace"
				textAnchor={horizontal ? "middle" : "start"}
				dominantBaseline={horizontal ? "auto" : "middle"}
			>
				{label}
			</text>
		</g>
	);
}
