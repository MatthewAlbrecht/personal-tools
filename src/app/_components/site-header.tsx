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
						moooose.dev
					</Link>
					{isAuthenticated && (
						<nav className="flex items-center gap-3">
							<Link href="/books" className="text-sm hover:underline">
								Books
							</Link>
							<Link href="/folio-society" className="text-sm hover:underline">
								Folio Society
							</Link>
							<Link href="/lyrics" className="text-sm hover:underline">
								Lyrics
							</Link>
							<Link
								href="/spotify-playlister"
								className="text-sm hover:underline"
							>
								Playlister
							</Link>
						<Link href="/albums" className="text-sm hover:underline">
							Albums
						</Link>
						<Link href="/robs-rankings" className="text-sm hover:underline">
							Rob's Rankings
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
