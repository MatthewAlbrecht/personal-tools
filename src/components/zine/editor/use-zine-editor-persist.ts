"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "~/lib/hooks/use-debounced-callback";

export type ZineEditorPersistStatus =
	| "idle"
	| "dirty"
	| "saving"
	| "saved"
	| "error";

const DEBOUNCE_MS = 500;
const SAVED_FLASH_MS = 1600;

/**
 * Debounced silent persist for zine edit fields.
 * Local state stays editable while saves run — never locks sibling inputs.
 */
export function useZineEditorPersist<T>(
	serverValue: T,
	persist: (value: T) => Promise<void>,
	options?: {
		isEqual?: (a: T, b: T) => boolean;
		enabled?: boolean;
	},
): {
	value: T;
	setValue: (next: T | ((current: T) => T)) => void;
	status: ZineEditorPersistStatus;
	flush: () => Promise<void>;
	errorMessage: string | null;
} {
	const isEqual = options?.isEqual ?? defaultIsEqual;
	const enabled = options?.enabled !== false;

	const [value, setValueState] = useState<T>(serverValue);
	const [status, setStatus] = useState<ZineEditorPersistStatus>("idle");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const valueRef = useRef(value);
	const serverRef = useRef(serverValue);
	const dirtyRef = useRef(false);
	const inFlightRef = useRef(false);
	const pendingRef = useRef(false);
	const persistRef = useRef(persist);
	const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	valueRef.current = value;
	persistRef.current = persist;
	serverRef.current = serverValue;

	useEffect(() => {
		if (dirtyRef.current || inFlightRef.current) {
			return;
		}
		if (isEqual(serverValue, valueRef.current)) {
			return;
		}
		setValueState(serverValue);
		serverRef.current = serverValue;
	}, [serverValue, isEqual]);

	useEffect(() => {
		return () => {
			if (savedTimeoutRef.current) {
				clearTimeout(savedTimeoutRef.current);
			}
		};
	}, []);

	const runPersist = useCallback(async (): Promise<void> => {
		if (!enabled) return;
		if (!dirtyRef.current && !pendingRef.current) return;
		if (inFlightRef.current) {
			pendingRef.current = true;
			return;
		}

		const snapshot = valueRef.current;
		if (isEqual(snapshot, serverRef.current)) {
			dirtyRef.current = false;
			pendingRef.current = false;
			setStatus("idle");
			return;
		}

		inFlightRef.current = true;
		dirtyRef.current = false;
		pendingRef.current = false;
		setStatus("saving");
		setErrorMessage(null);

		let succeeded = false;
		try {
			await persistRef.current(snapshot);
			serverRef.current = snapshot;
			succeeded = true;
			setStatus("saved");
			if (savedTimeoutRef.current) {
				clearTimeout(savedTimeoutRef.current);
			}
			savedTimeoutRef.current = setTimeout(() => {
				setStatus((current) => (current === "saved" ? "idle" : current));
			}, SAVED_FLASH_MS);
		} catch (error) {
			dirtyRef.current = true;
			const message = error instanceof Error ? error.message : "Failed to save";
			setErrorMessage(message);
			setStatus("error");
		} finally {
			inFlightRef.current = false;
			if (pendingRef.current) {
				pendingRef.current = false;
				void runPersist();
			} else if (succeeded && dirtyRef.current) {
				void runPersist();
			}
		}
	}, [enabled, isEqual]);

	const debouncedPersist = useDebouncedCallback(() => {
		void runPersist();
	}, DEBOUNCE_MS);

	const setValue = useCallback(
		(next: T | ((current: T) => T)) => {
			// Resolve synchronously so event.currentTarget is still valid
			// (nested setState updaters run later after React nulls it).
			const resolved = resolveZineEditorPersistNext(valueRef.current, next);
			valueRef.current = resolved;
			if (!isEqual(resolved, serverRef.current)) {
				dirtyRef.current = true;
				setStatus("dirty");
				setErrorMessage(null);
				debouncedPersist();
			}
			setValueState(resolved);
		},
		[debouncedPersist, isEqual],
	);

	const flush = useCallback(async (): Promise<void> => {
		await runPersist();
	}, [runPersist]);

	return {
		value,
		setValue,
		status,
		flush,
		errorMessage,
	};
}

export function resolveZineEditorPersistNext<T>(
	current: T,
	next: T | ((current: T) => T),
): T {
	if (typeof next === "function") {
		return (next as (current: T) => T)(current);
	}
	return next;
}

export function mergePersistStatuses(
	statuses: ZineEditorPersistStatus[],
): ZineEditorPersistStatus {
	if (statuses.includes("error")) return "error";
	if (statuses.includes("saving")) return "saving";
	if (statuses.includes("dirty")) return "dirty";
	if (statuses.includes("saved")) return "saved";
	return "idle";
}

function defaultIsEqual<T>(a: T, b: T): boolean {
	if (Object.is(a, b)) return true;
	if (
		typeof a === "object" &&
		a !== null &&
		typeof b === "object" &&
		b !== null
	) {
		return JSON.stringify(a) === JSON.stringify(b);
	}
	return false;
}
