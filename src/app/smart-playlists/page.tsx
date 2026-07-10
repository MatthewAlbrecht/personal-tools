"use client";

import { useQuery } from "convex/react";
import { ListMusic } from "lucide-react";
import { LoginPrompt } from "~/components/login-prompt";
import { useSpotifyAuth } from "~/lib/hooks/use-spotify-auth";
import { api } from "../../../convex/_generated/api";
import { RecipeList } from "./_components/recipe-list";

export default function SmartPlaylistsPage(): React.ReactNode {
	const { userId, isLoading, getValidAccessToken } = useSpotifyAuth();

	const recipes = useQuery(
		api.smartPlaylists.listRecipes,
		userId ? { userId } : "skip",
	);

	if (isLoading) {
		return (
			<div className="container mx-auto max-w-6xl p-6">
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
				message="Please log in to manage Smart Playlists"
				redirectPath="/smart-playlists"
			/>
		);
	}

	return (
		<div className="container mx-auto max-w-6xl p-6">
			<RecipeList
				recipes={recipes}
				userId={userId}
				getValidAccessToken={getValidAccessToken}
			/>
		</div>
	);
}
