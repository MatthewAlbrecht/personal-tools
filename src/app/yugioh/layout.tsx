import type { Metadata } from "next";
import type * as React from "react";

export const metadata: Metadata = {
	title: "Yu-Gi-Oh · moooose",
	description: "What it costs to finish each max-rarity Deck.",
};

export default function YugiohLayout({
	children,
}: {
	children: React.ReactNode;
}): React.ReactElement {
	return <div className="px-4 py-6 md:px-6 md:py-8">{children}</div>;
}
