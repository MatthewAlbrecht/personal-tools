import type { MetadataRoute } from "next";

/**
 * The installable app (served at /manifest.webmanifest): the whole site,
 * opening on the home page. The scope is the whole site so signing in at
 * /login stays inside the installed app. `id` is still "/yugioh" from when it
 * was the Yu-Gi-Oh app: changing it would orphan existing Android and desktop
 * installs. iOS only allows push once it's on the home screen with
 * `display: standalone`. Public in `src/lib/route-access.ts`.
 */
export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "moooose",
		short_name: "moooose",
		description: "Personal tools for music, books, cards and more.",
		id: "/yugioh",
		start_url: "/",
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
