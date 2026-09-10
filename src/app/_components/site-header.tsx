"use client";

import Link from "next/link";
import { MobileNavSheet } from "~/components/app-shell/mobile-nav-sheet";
import { Button } from "~/components/ui/button";
import { Kbd } from "~/components/ui/kbd";
import { useAuth } from "~/lib/auth-context";

export function SiteHeader() {
	const { isAuthenticated, logout } = useAuth();

	return (
		<header className="sticky top-0 z-50 w-full border-stone-900/10 border-b bg-[#efeeea]/90 backdrop-blur supports-[backdrop-filter]:bg-[#efeeea]/80">
			<div className="flex h-14 items-center gap-3 px-4 md:px-5">
				{isAuthenticated ? <MobileNavSheet /> : null}
				<Link
					href="/"
					className="shrink-0 font-[family-name:var(--font-display)] text-[1.2rem] tracking-tight text-stone-950"
				>
					moooose
				</Link>
				<div className="min-w-0 flex-1" />
				<nav className="flex shrink-0 items-center gap-2">
					{isAuthenticated ? (
						<>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								disabled
								title="Command palette coming soon"
								className="hidden gap-2 text-muted-foreground sm:inline-flex"
							>
								<span className="text-xs">Search</span>
								<Kbd className="pointer-events-none">⌘K</Kbd>
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => logout()}
							>
								Log out
							</Button>
						</>
					) : (
						<Button asChild variant="outline" size="sm">
							<Link href="/login">Sign in</Link>
						</Button>
					)}
				</nav>
			</div>
		</header>
	);
}
