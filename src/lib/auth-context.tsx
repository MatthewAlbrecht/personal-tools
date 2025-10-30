"use client";

import {
	type ReactNode,
	createContext,
	useContext,
	useEffect,
	useState,
} from "react";

type AuthContextType = {
	isAuthenticated: boolean;
	login: (username: string, password: string) => Promise<boolean>;
	logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
	const [isAuthenticated, setIsAuthenticated] = useState(false);

	// Check initial auth state on mount only
	useEffect(() => {
		const checkAuthStatus = async () => {
			try {
				const res = await fetch("/api/auth/status");
				const data = await res.json();
				setIsAuthenticated(data.isAuthenticated);
			} catch (error) {
				console.error("Auth status check failed:", error);
				setIsAuthenticated(false);
			}
		};

		checkAuthStatus();
	}, []);

	const login = async (
		username: string,
		password: string,
	): Promise<boolean> => {
		try {
			const body = new FormData();
			body.set("username", username);
			body.set("password", password);
			const res = await fetch("/api/auth", { method: "POST", body });

			if (res.ok) {
				// Immediately set authenticated state - don't poll cookies
				setIsAuthenticated(true);
				return true;
			}
			return false;
		} catch (error) {
			console.error("Login error:", error);
			return false;
		}
	};

	const logout = async (): Promise<void> => {
		try {
			const body = new FormData();
			body.set("intent", "logout");
			await fetch("/api/auth", { method: "POST", body });
		} catch (error) {
			console.error("Logout error:", error);
		} finally {
			// Always clear auth state and redirect
			setIsAuthenticated(false);
			window.location.href = "/";
		}
	};

	return (
		<AuthContext.Provider value={{ isAuthenticated, login, logout }}>
			{children}
		</AuthContext.Provider>
	);
}
