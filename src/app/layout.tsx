import "~/styles/globals.css";

import type { Metadata } from "next";
import { Geist } from "next/font/google";

import { SiteHeader } from "~/app/_components/site-header";
import { Toaster } from "~/components/ui/sonner";
import { TRPCReactProvider } from "~/trpc/react";
import ConvexClientProvider from "~/providers/ConvexProvider";

export const metadata: Metadata = {
	title: "moooose",
	description: "moooose.dev",
	icons: [{ rel: "icon", url: "/favicon.svg" }],
};

const geist = Geist({
	subsets: ["latin"],
	variable: "--font-geist-sans",
});

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" className={`${geist.variable}`}>
			<body>
				<ConvexClientProvider>
					<TRPCReactProvider>
						<SiteHeader />
						{children}
						<Toaster />
					</TRPCReactProvider>
				</ConvexClientProvider>
			</body>
		</html>
	);
}
