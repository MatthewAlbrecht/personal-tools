import type { Metadata, Viewport } from "next";
import type * as React from "react";
import { AppServiceWorker } from "./_components/app-service-worker";

export const metadata: Metadata = {
	title: "Yu-Gi-Oh · moooose",
	description: "What it costs to finish each max-rarity Deck.",
	appleWebApp: { capable: true, title: "Yu-Gi-Oh", statusBarStyle: "default" },
	icons: { apple: "/apple-icon.png" },
};

// Matches --background. Light only for now: the root ThemeProvider defaults
// to light, so a dark bar under a system dark mode would sit over a light page.
export const viewport: Viewport = { themeColor: "#ffffff" };

export default function YugiohLayout({
	children,
}: {
	children: React.ReactNode;
}): React.ReactElement {
	return (
		<div className="px-4 py-6 md:px-6 md:py-8">
			<AppServiceWorker />
			{children}
		</div>
	);
}
