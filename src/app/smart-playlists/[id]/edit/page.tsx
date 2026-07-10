"use client";

import { useQuery } from "convex/react";
import { ListMusic } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { LoginPrompt } from "~/components/login-prompt";
import { Button } from "~/components/ui/button";
import { useSpotifyAuth } from "~/lib/hooks/use-spotify-auth";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { RecipeForm } from "../../_components/recipe-form";

export default function EditSmartPlaylistPage(): React.ReactNode {
	const params = useParams<{ id: string }>();
	const recipeId = (params?.id ?? "") as Id<"smartPlaylists">;
	const { userId, isLoading, getValidAccessToken } = useSpotifyAuth();

	const recipe = useQuery(
		api.smartPlaylists.getRecipe,
		userId && recipeId ? { userId, recipeId } : "skip",
	);

	if (isLoading) {
		return (
			<div className="container mx-auto max-w-3xl p-6">
				<div className="flex h-[50vh] items-center justify-center">
					<p className="text-muted-foreground">Loading...</p>
				</div>
			</div>
		);
	}

	if (!userId) {
		return (
			<LoginPrompt
				icon={ListMusic}
				message="Please log in to edit Smart Playlists"
				redirectPath={`/smart-playlists/${recipeId}/edit`}
			/>
		);
	}

	if (recipe === undefined) {
		return (
			<div className="container mx-auto max-w-3xl p-6">
				<p className="text-muted-foreground">Loading recipe...</p>
			</div>
		);
	}

	if (recipe === null) {
		return (
			<div className="container mx-auto max-w-3xl space-y-4 p-6">
				<h1 className="font-semibold text-2xl tracking-tight">
					Recipe not found
				</h1>
				<p className="text-muted-foreground text-sm">
					This recipe doesn’t exist or you don’t have access.
				</p>
				<Button variant="outline" asChild>
					<Link href="/smart-playlists">Back to recipes</Link>
				</Button>
			</div>
		);
	}

	return (
		<div className="container mx-auto max-w-3xl p-6">
			<div className="mb-6 space-y-1">
				<h1 className="font-semibold text-2xl tracking-tight">Edit recipe</h1>
				<p className="text-muted-foreground text-sm">
					Update filters or sync mode. Source is locked after create.
				</p>
			</div>
			<RecipeForm
				mode="edit"
				userId={userId}
				getValidAccessToken={getValidAccessToken}
				recipeId={recipe._id}
				initialName={recipe.name}
				initialSource={recipe.source}
				initialFilters={recipe.filters}
				initialSyncMode={recipe.syncMode}
			/>
		</div>
	);
}
