"use client";

import { useEffect, useState } from "react";

type AuthState = {
	userId: string | null;
	isLoading: boolean;
};

// Hook to get the auth status and userId from the server
export function useAuthToken(): AuthState {
	const [state, setState] = useState<AuthState>({
		userId: null,
		isLoading: true,
	});

	useEffect(() => {
		const checkAuth = async () => {
			try {
				const res = await fetch("/api/auth/status");
				const data = await res.json();
				setState({
					userId: data.userId ?? null,
					isLoading: false,
				});
			} catch (error) {
				console.error("Auth check failed:", error);
				setState({ userId: null, isLoading: false });
			}
		};

		checkAuth();

		// Check auth on focus/visibility change
		const handleVisibilityChange = () => {
			if (!document.hidden) {
				checkAuth();
			}
		};

		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, []);

	return state;
}
