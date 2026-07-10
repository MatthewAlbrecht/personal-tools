"use client";

import { useEffect, useState } from "react";
import {
	getLastSeenStorageKey,
	getVisitSinceSessionKey,
	resolveVisitSince,
} from "~/lib/music-funnel-visit";

export function useMusicFunnelVisitCursor(userId: string): {
	visitSince: number | null;
} {
	const [visitSince, setVisitSince] = useState<number | null>(null);

	useEffect(() => {
		const sessionKey = getVisitSinceSessionKey(userId);
		const localKey = getLastSeenStorageKey(userId);
		const now = Date.now();

		let sessionValue = sessionStorage.getItem(sessionKey);
		const localValue = localStorage.getItem(localKey);
		const resolved = resolveVisitSince({ sessionValue, localValue, now });

		if (sessionValue === null) {
			sessionStorage.setItem(sessionKey, String(resolved));
			sessionValue = String(resolved);
		}

		setVisitSince(resolved);

		function persistLeave(): void {
			localStorage.setItem(localKey, String(Date.now()));
		}

		function handleVisibilityChange(): void {
			if (document.visibilityState === "hidden") {
				persistLeave();
			}
		}

		window.addEventListener("pagehide", persistLeave);
		document.addEventListener("visibilitychange", handleVisibilityChange);
		return () => {
			window.removeEventListener("pagehide", persistLeave);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, [userId]);

	return { visitSince };
}
