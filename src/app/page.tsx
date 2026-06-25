import { cookies } from "next/headers";
import Link from "next/link";

export default async function Home() {
	const cookieStore = await cookies();
	const isAuthed = cookieStore.get("session")?.value != null;
	return (
		<main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#0f172a] to-[#0b1220] text-white">
			<div className="container flex flex-col items-center justify-center gap-6 px-4 py-16">
				<h1 className="font-extrabold text-5xl tracking-tight">
					Personal Tools
				</h1>
				<p className="text-white/80">Jump to a tool:</p>
				<div className="grid grid-cols-1 gap-4">
					<Link
						className="rounded-lg bg-white/10 px-6 py-3 text-center font-semibold transition hover:bg-white/20"
						href="/public/robs-top-50"
					>
						Rob&apos;s Top 50 →
					</Link>
					{isAuthed ? (
						<>
							<Link
								className="rounded-lg bg-white/10 px-6 py-3 text-center font-semibold transition hover:bg-white/20"
								href="/books"
							>
								Book Search Aggregator →
							</Link>
							<Link
								className="rounded-lg bg-white/10 px-6 py-3 text-center font-semibold transition hover:bg-white/20"
								href="/folio-society"
							>
								Folio Society Release Tracker →
							</Link>
							<Link
								className="rounded-lg bg-white/10 px-6 py-3 text-center font-semibold transition hover:bg-white/20"
								href="/lyrics"
							>
								Album Lyrics Aggregator →
							</Link>
							<Link
								className="rounded-lg bg-white/10 px-6 py-3 text-center font-semibold transition hover:bg-white/20"
								href="/spotify-playlister"
							>
								Spotify Playlister →
							</Link>
							<Link
								className="rounded-lg bg-white/10 px-6 py-3 text-center font-semibold transition hover:bg-white/20"
								href="/albums"
							>
								Albums →
							</Link>
							<Link
								className="rounded-lg bg-white/10 px-6 py-3 text-center font-semibold transition hover:bg-white/20"
								href="/concerts"
							>
								Concert Tracker →
							</Link>
							<Link
								className="rounded-lg bg-white/10 px-6 py-3 text-center font-semibold transition hover:bg-white/20"
								href="/robs-rankings"
							>
								Rob&apos;s Top 50 — Editor →
							</Link>
						</>
					) : (
						<p className="text-white/60">
							Sign in for more tools, or browse Rob&apos;s Top 50 above.
						</p>
					)}
				</div>
			</div>
		</main>
	);
}
