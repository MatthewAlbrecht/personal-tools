"use client";

import Link from "next/link";
import { useAuth } from "~/lib/auth-context";

export function SiteHeader() {
	const { isAuthenticated, logout } = useAuth();

	return (
		<header className="sticky top-0 z-50 w-full border-b bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
				<div className="flex min-w-0 flex-1 items-center gap-3">
					<Link href="/" className="shrink-0 font-semibold tracking-tight">
						moooose.dev
					</Link>
					<div className="min-w-0 flex-1 overflow-x-auto">
						<div className="flex w-max items-center gap-3 pr-2">
							<Link
								href={
									isAuthenticated ? "/robs-rankings" : "/public/robs-top-50"
								}
								className="text-sm hover:underline"
							>
								Rob&apos;s Top 50
							</Link>
							{isAuthenticated && (
								<nav className="flex items-center gap-3">
									<Link
										href="/folio-society"
										className="text-sm hover:underline"
									>
										Folio Society
									</Link>
									<Link href="/lyrics" className="text-sm hover:underline">
										Lyrics
									</Link>
									<Link href="/albums" className="text-sm hover:underline">
										Albums
									</Link>
									<Link
										href="/music-funnel"
										className="text-sm hover:underline"
									>
										Music Funnel
									</Link>
									<Link href="/concerts" className="text-sm hover:underline">
										Concerts
									</Link>
									<Link href="/birthdays" className="text-sm hover:underline">
										Birthdays
									</Link>
									<Link
										href="/for-later-albums"
										className="text-sm hover:underline"
									>
										For Later
									</Link>
									<Link
										href="/album-enrichment"
										className="text-sm hover:underline"
									>
										Enrichment
									</Link>
									<Link
										href="/smart-playlists"
										className="text-sm hover:underline"
									>
										Smart Playlists
									</Link>
								</nav>
							)}
						</div>
					</div>
				</div>
				<nav className="flex shrink-0 items-center gap-3">
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
