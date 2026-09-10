import { cookies } from "next/headers";
import Link from "next/link";
import { HomeMusicDashboard } from "~/app/_components/home-music-dashboard";
import { Button } from "~/components/ui/button";

export default async function Home() {
	const cookieStore = await cookies();
	const isAuthed = cookieStore.get("session")?.value != null;

	if (isAuthed) {
		return <HomeMusicDashboard />;
	}

	return (
		<main className="relative flex min-h-[calc(100vh-3.5rem)] flex-col justify-center overflow-hidden px-4 py-16">
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,_oklch(0.72_0.12_55_/_0.25),_transparent_40%),radial-gradient(circle_at_80%_0%,_oklch(0.45_0.04_250_/_0.2),_transparent_35%)]"
			/>
			<div className="relative mx-auto max-w-lg text-center">
				<p className="mb-3 font-semibold text-[0.7rem] text-muted-foreground uppercase tracking-[0.2em]">
					moooose
				</p>
				<h1 className="font-[family-name:var(--font-display)] text-5xl tracking-tight">
					Personal listening tools
				</h1>
				<p className="mt-4 text-muted-foreground">
					Sign in for your queue and history, or browse the public Top 50.
				</p>
				<div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
					<Button asChild size="lg">
						<Link href="/login">Sign in</Link>
					</Button>
					<Button asChild size="lg" variant="outline">
						<Link href="/public/robs-top-50">Rob&apos;s Top 50</Link>
					</Button>
				</div>
			</div>
		</main>
	);
}
