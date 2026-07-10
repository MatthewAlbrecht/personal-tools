"use client";

import { ListMusic, Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { RecipeCard } from "./recipe-card";

export function RecipeList({
	recipes,
	userId,
	getValidAccessToken,
}: {
	recipes: Doc<"smartPlaylists">[] | undefined;
	userId: string;
	getValidAccessToken: () => Promise<string | null>;
}): React.ReactNode {
	const isLoading = recipes === undefined;

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between gap-4">
				<div>
					<h1 className="font-semibold text-2xl tracking-tight">
						Smart Playlists
					</h1>
					<p className="text-muted-foreground text-sm">
						Recipes that keep Spotify playlists in sync with your library
						filters.
					</p>
				</div>
				<Button asChild>
					<Link href="/smart-playlists/new">
						<Plus className="size-4" />
						New recipe
					</Link>
				</Button>
			</div>

			{isLoading ? (
				<p className="text-muted-foreground">Loading recipes...</p>
			) : recipes.length === 0 ? (
				<div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed py-16">
					<ListMusic className="size-10 text-muted-foreground" />
					<div className="space-y-1 text-center">
						<p className="font-medium">No recipes yet</p>
						<p className="text-muted-foreground text-sm">
							Create a recipe to sync a filtered album set to Spotify.
						</p>
					</div>
					<Button asChild>
						<Link href="/smart-playlists/new">
							<Plus className="size-4" />
							New recipe
						</Link>
					</Button>
				</div>
			) : (
				<div className="grid gap-4">
					{recipes.map((recipe) => (
						<RecipeCard
							key={recipe._id}
							recipe={recipe}
							userId={userId}
							getValidAccessToken={getValidAccessToken}
						/>
					))}
				</div>
			)}
		</div>
	);
}
