"use client";

import { useEffect, useState } from "react";
import { type BookcaseConfig, DEFAULT_CONFIG, clampConfig } from "./geometry";

const STORAGE_KEY = "bookcase-designer-v1";

type SetBookcaseConfig = (
	next: BookcaseConfig | ((prev: BookcaseConfig) => BookcaseConfig),
) => void;

export function useBookcaseConfig(): {
	config: BookcaseConfig;
	setConfig: SetBookcaseConfig;
	resetConfig: () => void;
} {
	const [config, setConfigState] = useState<BookcaseConfig>(DEFAULT_CONFIG);

	useEffect(() => {
		try {
			const raw = window.localStorage.getItem(STORAGE_KEY);
			if (!raw) return;
			const parsed: unknown = JSON.parse(raw);
			if (!parsed || typeof parsed !== "object") return;
			setConfigState(clampConfig({ ...DEFAULT_CONFIG, ...parsed }));
		} catch {
			// ignore bad storage
		}
	}, []);

	useEffect(() => {
		try {
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
		} catch {
			// ignore quota
		}
	}, [config]);

	function setConfig(
		next: BookcaseConfig | ((prev: BookcaseConfig) => BookcaseConfig),
	): void {
		setConfigState((prev) =>
			clampConfig(typeof next === "function" ? next(prev) : next),
		);
	}

	function resetConfig(): void {
		setConfigState(DEFAULT_CONFIG);
	}

	return { config, setConfig, resetConfig };
}
