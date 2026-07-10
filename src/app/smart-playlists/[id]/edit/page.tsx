import Link from "next/link";
import { Button } from "~/components/ui/button";

export default function EditSmartPlaylistPage(): React.ReactNode {
	return (
		<div className="container mx-auto max-w-6xl p-6">
			<div className="space-y-4">
				<h1 className="font-semibold text-2xl tracking-tight">Edit recipe</h1>
				<p className="text-muted-foreground">Recipe form coming in Task 9</p>
				<Button variant="outline" asChild>
					<Link href="/smart-playlists">Back to recipes</Link>
				</Button>
			</div>
		</div>
	);
}
