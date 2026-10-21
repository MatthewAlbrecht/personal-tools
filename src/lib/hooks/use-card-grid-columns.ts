"use client";

import { useSyncExternalStore } from "react";
import {
	DEFAULT_GRID_COLUMNS,
	type GridColumns,
	parseGridColumns,
} from "~/lib/yugioh/card-grid";

const STORAGE_KEY = "yugioh:card-grid-columns";
/** `storage` only fires in other tabs; this tells this tab's grids. */
const CHANGE_EVENT = "yugioh:card-grid-columns";

function subscribe(onChange: () => void): () => void {
	window.addEventListener("storage", onChange);
	window.addEventListener(CHANGE_EVENT, onChange);
	return () => {
		window.removeEventListener("storage", onChange);
		window.removeEventListener(CHANGE_EVENT, onChange);
	};
}

function read(): GridColumns {
	try {
		return parseGridColumns(window.localStorage.getItem(STORAGE_KEY));
	} catch {
		// Storage can be blocked (private mode); the grid keeps the default.
		return DEFAULT_GRID_COLUMNS;
	}
}

/**
 * The Cards grid's column choice, kept per device in localStorage: a phone and
 * a desktop want different densities, and it's a view preference, not a
 * place worth linking to.
 */
export function useCardGridColumns(): GridColumns {
	return useSyncExternalStore(subscribe, read, () => DEFAULT_GRID_COLUMNS);
}

export function saveCardGridColumns(columns: GridColumns): void {
	try {
		window.localStorage.setItem(STORAGE_KEY, String(columns));
	} catch {
		// Storage can be blocked; the choice just won't outlive the page.
	}
	window.dispatchEvent(new Event(CHANGE_EVENT));
}
