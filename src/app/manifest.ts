import type { MetadataRoute } from "next";

/**
 * The installable app (served at /manifest.webmanifest). It opens on the
 * Yu-Gi-Oh tracker; the scope is the whole site so signing in at /login stays
 * inside the installed app. iOS only allows push once it's on the home screen
 * with `display: standalone`. Public in `src/lib/route-access.ts`.
 */
export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "Yu-Gi-Oh · moooose",
		short_name: "Yu-Gi-Oh",
		description: "What it costs to finish each max-rarity Deck.",
		id: "/yugioh",
		start_url: "/yugioh",
		scope: "/",
		display: "standalone",
		background_color: "#ffffff",
		theme_color: "#ffffff",
		icons: [
			{ src: "/icon-192.png", sizes: "192x192", type: "image/png" },
			{ src: "/icon-512.png", sizes: "512x512", type: "image/png" },
			{
				src: "/icon-maskable-512.png",
				sizes: "512x512",
				type: "image/png",
				purpose: "maskable",
			},
		],
	};
}
