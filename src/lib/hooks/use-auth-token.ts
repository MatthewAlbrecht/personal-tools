"use client";

import { useEffect, useState } from "react";

// Hook to get the auth token from cookies
export function useAuthToken(): string | null {
	const [token, setToken] = useState<string | null>(null);

	useEffect(() => {
		// Get the session cookie
		const getCookie = (name: string): string | null => {
			const value = `; ${document.cookie}`;
			const parts = value.split(`; ${name}=`);
			if (parts.length === 2) {
				return parts.pop()?.split(";").shift() || null;
			}
			return null;
		};

		const sessionToken = getCookie("session");
		setToken(sessionToken);

		// Listen for cookie changes (login/logout)
		const checkAuth = () => {
			const newToken = getCookie("session");
			if (newToken !== token) {
				setToken(newToken);
			}
		};

		// Check auth on focus/visibility change
		const handleVisibilityChange = () => {
			if (!document.hidden) {
				checkAuth();
			}
		};

		document.addEventListener("visibilitychange", handleVisibilityChange);

		// Also check periodically
		const interval = setInterval(checkAuth, 30000); // every 30 seconds

		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			clearInterval(interval);
		};
	}, [token]);

	return token;
}
