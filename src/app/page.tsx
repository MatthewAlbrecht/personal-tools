import Link from "next/link";
import { cookies } from "next/headers";

export default async function Home() {
	const cookieStore = await cookies();
	const isAuthed = cookieStore.get("session")?.value != null;
	return (
		<main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#0f172a] to-[#0b1220] text-white">
			<div className="container flex flex-col items-center justify-center gap-6 px-4 py-16">
				<h1 className="font-extrabold text-5xl tracking-tight">Personal Tools</h1>
				<p className="text-white/80">Jump to a tool:</p>
				<div className="grid grid-cols-1 gap-4">
					{isAuthed ? (
						<Link
							className="rounded-lg bg-white/10 px-6 py-3 text-center font-semibold transition hover:bg-white/20"
							href="/books"
						>
							Book Search Aggregator →
						</Link>
					) : null}
					<Link
						className="rounded-lg bg-white/10 px-6 py-3 text-center font-semibold transition hover:bg-white/20"
						href="/login"
					>
						Sign in →
					</Link>
				</div>
			</div>
		</main>
	);
}
