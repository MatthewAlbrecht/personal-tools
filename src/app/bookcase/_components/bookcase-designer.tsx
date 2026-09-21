"use client";

import { Minus, Plus, Scan } from "lucide-react";
import {
	type PointerEvent,
	type ReactElement,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { measureBookcase } from "../_utils/geometry";
import { useBookcaseConfig } from "../_utils/use-bookcase-config";
import { BookcaseControls } from "./bookcase-controls";
import { BookcaseElevation } from "./bookcase-elevation";

const MIN_PPI = 2.4;
const MAX_PPI = 28;
const WORLD_PAD = 7;

export function BookcaseDesigner(): ReactElement {
	const { config, setConfig, resetConfig } = useBookcaseConfig();
	const measurements = useMemo(() => measureBookcase(config), [config]);
	const canvasRef = useRef<HTMLDivElement>(null);
	const fitted = useRef(false);
	const [panelOpen, setPanelOpen] = useState(false);
	const [view, setView] = useState({ zoom: 6, panX: 48, panY: 56 });
	const drag = useRef<{
		pointerId: number;
		x: number;
		y: number;
		panX: number;
		panY: number;
	} | null>(null);

	const fitToView = useCallback(() => {
		const el = canvasRef.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		if (rect.width < 40 || rect.height < 40) return;
		const worldW = measurements.overallWidth + WORLD_PAD;
		const worldH = measurements.overallHeight + WORLD_PAD;
		const rightGutter = rect.width >= 768 ? 340 : 16;
		const usableW = Math.max(240, rect.width - rightGutter - 24);
		const usableH = Math.max(240, rect.height - 36);
		const zoom = clamp(
			Math.min(usableW / worldW, usableH / worldH) * 0.92,
			MIN_PPI,
			MAX_PPI,
		);
		setView({
			zoom,
			panX: 18 + (usableW - worldW * zoom) / 2 + 1.4 * zoom,
			panY: (usableH - worldH * zoom) / 2 + 2.1 * zoom,
		});
	}, [measurements.overallHeight, measurements.overallWidth]);

	useEffect(() => {
		setPanelOpen(window.matchMedia("(min-width: 768px)").matches);
	}, []);

	useEffect(() => {
		const el = canvasRef.current;
		if (!el) return;
		const observer = new ResizeObserver(() => {
			if (!fitted.current) {
				fitToView();
				fitted.current = true;
			}
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, [fitToView]);

	useEffect(() => {
		const el = canvasRef.current;
		if (!el) return;
		function onWheel(event: WheelEvent) {
			event.preventDefault();
			const node = canvasRef.current;
			if (!node) return;
			const rect = node.getBoundingClientRect();
			const factor = event.deltaY > 0 ? 1 / 1.08 : 1.08;
			zoomAt(event.clientX - rect.left, event.clientY - rect.top, factor);
		}
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, []);

	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (event.key === "+" || event.key === "=") {
				event.preventDefault();
				nudgeZoom(1.12);
			}
			if (event.key === "-" || event.key === "_") {
				event.preventDefault();
				nudgeZoom(1 / 1.12);
			}
			if (event.key === "0") {
				event.preventDefault();
				fitToView();
			}
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [fitToView]);

	function nudgeZoom(factor: number): void {
		const el = canvasRef.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		zoomAt(rect.width / 2, rect.height / 2, factor);
	}

	function zoomAt(cx: number, cy: number, factor: number): void {
		setView((prev) => {
			const nextZoom = clamp(prev.zoom * factor, MIN_PPI, MAX_PPI);
			const worldX = (cx - prev.panX) / prev.zoom;
			const worldY = (cy - prev.panY) / prev.zoom;
			return {
				zoom: nextZoom,
				panX: cx - worldX * nextZoom,
				panY: cy - worldY * nextZoom,
			};
		});
	}

	function handlePointerDown(event: PointerEvent<HTMLDivElement>): void {
		if (event.button !== 0) return;
		drag.current = {
			pointerId: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			panX: view.panX,
			panY: view.panY,
		};
		event.currentTarget.setPointerCapture(event.pointerId);
	}

	function handlePointerMove(event: PointerEvent<HTMLDivElement>): void {
		const start = drag.current;
		if (!start || start.pointerId !== event.pointerId) return;
		setView((prev) => ({
			...prev,
			panX: start.panX + (event.clientX - start.x),
			panY: start.panY + (event.clientY - start.y),
		}));
	}

	function handlePointerUp(event: PointerEvent<HTMLDivElement>): void {
		if (drag.current?.pointerId === event.pointerId) {
			drag.current = null;
		}
	}

	return (
		<div className="case-studio relative h-[calc(100vh-3.5rem)] overflow-hidden">
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 opacity-[0.28] mix-blend-multiply"
				style={{
					backgroundImage:
						"url(\"data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")",
				}}
			/>

			<div
				ref={canvasRef}
				className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				onPointerCancel={handlePointerUp}
			>
				<svg
					className="h-full w-full"
					role="img"
					aria-label="Front elevation of the bookcase"
				>
					<g
						transform={`translate(${view.panX} ${view.panY}) scale(${view.zoom})`}
					>
						<BookcaseElevation
							config={config}
							measurements={measurements}
							pixelsPerInch={view.zoom}
						/>
					</g>
				</svg>
			</div>

			<div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 md:p-5">
				<div className="flex items-start justify-between gap-4">
					<TitleBlock
						scale={view.zoom}
						cases={config.caseCount}
						shelves={config.shelfCount}
					/>
					<div className="hidden md:block">
						<BookcaseControls
							config={config}
							measurements={measurements}
							onChange={setConfig}
							onReset={() => {
								resetConfig();
								window.requestAnimationFrame(fitToView);
							}}
							collapsed={!panelOpen}
							onToggleCollapsed={() => setPanelOpen((open) => !open)}
						/>
					</div>
				</div>

				<div className="flex items-end justify-between gap-3">
					<ZoomToolbar
						onZoomIn={() => nudgeZoom(1.15)}
						onZoomOut={() => nudgeZoom(1 / 1.15)}
						onFit={fitToView}
					/>
					<p className="hidden font-[family-name:var(--font-case-mono)] text-[#6d675c] text-[0.62rem] uppercase tracking-[0.18em] md:block">
						Drag to pan · scroll to zoom
					</p>
				</div>
			</div>

			<div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 md:hidden">
				<BookcaseControls
					config={config}
					measurements={measurements}
					onChange={setConfig}
					onReset={() => {
						resetConfig();
						window.requestAnimationFrame(fitToView);
					}}
					collapsed={!panelOpen}
					onToggleCollapsed={() => setPanelOpen((open) => !open)}
				/>
			</div>
		</div>
	);
}

function TitleBlock({
	scale,
	cases,
	shelves,
}: {
	scale: number;
	cases: number;
	shelves: number;
}): ReactElement {
	return (
		<div className="pointer-events-none max-w-[16rem] border border-[#2a2824]/12 bg-[#efeae0]/85 px-3 py-2.5 backdrop-blur-[2px]">
			<p className="font-[family-name:var(--font-case-mono)] text-[#7a7468] text-[0.58rem] uppercase tracking-[0.24em]">
				Elevation · Front
			</p>
			<h1 className="mt-1 font-[family-name:var(--font-case-display)] text-[#211f1b] text-[1.85rem] leading-[0.9] tracking-tight">
				Bookcase
			</h1>
			<p className="mt-2 font-[family-name:var(--font-case-mono)] text-[#6d675c] text-[0.62rem] uppercase tracking-[0.16em]">
				{cases} case{cases === 1 ? "" : "s"} · {shelves} shelf
				{shelves === 1 ? "" : "ves"} · {scale.toFixed(1)} px/in
			</p>
		</div>
	);
}

function ZoomToolbar({
	onZoomIn,
	onZoomOut,
	onFit,
}: {
	onZoomIn: () => void;
	onZoomOut: () => void;
	onFit: () => void;
}): ReactElement {
	return (
		<div className="pointer-events-auto flex border border-[#2a2824]/12 bg-[#efeae0]/90 shadow-[0_10px_28px_-18px_rgba(20,18,14,0.5)] backdrop-blur-sm">
			<ZoomButton label="Zoom out" onClick={onZoomOut}>
				<Minus className="size-3.5" />
			</ZoomButton>
			<ZoomButton label="Fit drawing" onClick={onFit}>
				<Scan className="size-3.5" />
			</ZoomButton>
			<ZoomButton label="Zoom in" onClick={onZoomIn}>
				<Plus className="size-3.5" />
			</ZoomButton>
		</div>
	);
}

function ZoomButton({
	label,
	onClick,
	children,
}: {
	label: string;
	onClick: () => void;
	children: ReactNode;
}): ReactElement {
	return (
		<button
			type="button"
			aria-label={label}
			onClick={onClick}
			className="flex size-9 items-center justify-center text-[#2c2a26] transition-colors hover:bg-[#2a2824]/6"
		>
			{children}
		</button>
	);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
