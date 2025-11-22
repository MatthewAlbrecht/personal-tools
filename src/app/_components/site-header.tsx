"use client";

import Link from "next/link";
import { useAuth } from "~/lib/auth-context";

export function SiteHeader() {
	const { isAuthenticated, logout } = useAuth();

	return (
		<header className="sticky top-0 z-50 w-full border-b bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
				<div className="flex items-center gap-3">
					<Link href="/" className="font-semibold tracking-tight">
						Your App
					</Link>
					{isAuthenticated && (
						<nav className="flex items-center gap-3">
							<Link href="/example" className="text-sm hover:underline">
								Example
							</Link>
						</nav>
					)}
				</div>
				<nav className="flex items-center gap-3">
					{isAuthenticated ? (
						<button
							type="button"
							onClick={() => logout()}
							className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
						>
							Log out
						</button>
					) : (
						<Link
							href="/login"
							className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
						>
							Sign in
						</Link>
					)}
				</nav>
			</div>
		</header>
	);
}
