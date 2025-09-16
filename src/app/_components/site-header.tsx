import { cookies } from "next/headers";
import Link from "next/link";

export async function SiteHeader() {
	const cookieStore = await cookies();
	const isAuthed = cookieStore.get("session")?.value != null;

	return (
		<header className="sticky top-0 z-50 w-full border-b bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
				<div className="flex items-center gap-3">
					<Link href="/" className="font-semibold tracking-tight">
						moooose.dev
					</Link>
					<nav className="flex items-center gap-3">
						<Link href="/books" className="text-sm hover:underline">
							Books
						</Link>
						<Link href="/folio-society" className="text-sm hover:underline">
							Folio Society
						</Link>
					</nav>
				</div>
				<nav className="flex items-center gap-3">
					{isAuthed ? (
						<form action="/api/auth" method="post">
							<input type="hidden" name="intent" value="logout" />
							<button
								type="submit"
								className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
							>
								Log out
							</button>
						</form>
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
