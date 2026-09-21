import type { Metadata } from "next";
import { IBM_Plex_Mono, Newsreader } from "next/font/google";
import type { ReactElement, ReactNode } from "react";
import "./bookcase.css";

const newsreader = Newsreader({
	subsets: ["latin"],
	variable: "--font-case-display",
	display: "swap",
});

const plexMono = IBM_Plex_Mono({
	subsets: ["latin"],
	weight: ["400", "500"],
	variable: "--font-case-mono",
	display: "swap",
});

export const metadata: Metadata = {
	title: "Bookcase",
	description: "Front elevation designer for a mirrored record-and-book case.",
};

export default function BookcaseLayout({
	children,
}: {
	children: ReactNode;
}): ReactElement {
	return (
		<div className={`${newsreader.variable} ${plexMono.variable}`}>
			{children}
		</div>
	);
}
