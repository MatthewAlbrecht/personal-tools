import { cookies } from "next/headers";
import Link from "next/link";
import { ExampleTrpcDemo } from "./_components/example-trpc-demo";

export default async function Home() {
	const cookieStore = await cookies();
	const isAuthed = cookieStore.get("session")?.value != null;
	
	return (
		<main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#0f172a] to-[#0b1220] text-white">
			<div className="container flex flex-col items-center justify-center gap-8 px-4 py-16">
				<div className="text-center">
					<h1 className="font-extrabold text-5xl tracking-tight">
						Next.js Boilerplate
					</h1>
					<p className="mt-4 text-white/80">
						A modern stack with tRPC, Convex, and authentication
					</p>
				</div>

				{isAuthed ? (
					<div className="w-full">
						<div className="mb-8 text-center">
							<p className="text-sm text-white/60">
								You are authenticated. Try out the examples below.
							</p>
						</div>
						<ExampleTrpcDemo />
					</div>
				) : (
					<div className="text-center">
						<p className="mb-4 text-white/60">Sign in to access the app</p>
						<Link
							className="inline-block rounded-lg bg-white/10 px-6 py-3 text-center font-semibold transition hover:bg-white/20"
							href="/login"
						>
							Go to Login →
						</Link>
					</div>
				)}
			</div>
		</main>
	);
}
