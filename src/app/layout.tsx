import "~/styles/globals.css";

import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import { SiteHeader } from "~/app/_components/site-header";
import { AppShell } from "~/components/app-shell/app-shell";
import { Toaster } from "~/components/ui/sonner";
import { AuthProvider } from "~/lib/auth-context";
import ConvexClientProvider from "~/providers/ConvexProvider";
import { TRPCReactProvider } from "~/trpc/react";

const sourceSans = Source_Sans_3({
	subsets: ["latin"],
	variable: "--font-geist-sans",
});

const fraunces = Fraunces({
	subsets: ["latin"],
	variable: "--font-display",
});

export const metadata: Metadata = {
	title: "moooose",
	description: "moooose.dev",
	icons: [{ rel: "icon", url: "/favicon.svg" }],
};

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" className={`${sourceSans.variable} ${fraunces.variable}`}>
			<body className="min-h-screen bg-background font-sans text-foreground antialiased">
				<AuthProvider>
					<ConvexClientProvider>
						<TRPCReactProvider>
							<SiteHeader />
							<AppShell>{children}</AppShell>
							<Toaster />
						</TRPCReactProvider>
					</ConvexClientProvider>
				</AuthProvider>
			</body>
		</html>
	);
}
