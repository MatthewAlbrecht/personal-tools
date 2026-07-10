"use client";

import { ListMusic } from "lucide-react";
import { LoginPrompt } from "~/components/login-prompt";
import { useSpotifyAuth } from "~/lib/hooks/use-spotify-auth";
import { RecipeForm } from "../_components/recipe-form";

export default function NewSmartPlaylistPage(): React.ReactNode {
	const { userId, isLoading, getValidAccessToken } = useSpotifyAuth();

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
				message="Please log in to create Smart Playlists"
				redirectPath="/smart-playlists/new"
			/>
		);
	}

	return (
		<div className="container mx-auto max-w-3xl p-6">
			<div className="mb-6 space-y-1">
				<h1 className="font-semibold text-2xl tracking-tight">New recipe</h1>
				<p className="text-muted-foreground text-sm">
					Define filters and sync mode. Preview updates as you edit.
				</p>
			</div>
			<RecipeForm
				mode="create"
				userId={userId}
				getValidAccessToken={getValidAccessToken}
			/>
		</div>
	);
}
