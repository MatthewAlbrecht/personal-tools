import "~/styles/globals.css";

import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import { SiteHeader } from "~/app/_components/site-header";
import { AppServiceWorker } from "~/components/app-service-worker";
import { AppShell } from "~/components/app-shell/app-shell";
import { Toaster } from "~/components/ui/sonner";
import { AuthProvider } from "~/lib/auth-context";
import ConvexClientProvider from "~/providers/ConvexProvider";
import { ThemeProvider } from "~/providers/theme-provider";
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
	// The installed app is the whole site (see `manifest.ts`). Site-wide so
	// adding to the home screen from any page gets the same name and icon.
	appleWebApp: { capable: true, title: "moooose", statusBarStyle: "default" },
	icons: { icon: "/favicon.svg", apple: "/apple-icon.png" },
};

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html
			lang="en"
			className={`${sourceSans.variable} ${fraunces.variable}`}
			suppressHydrationWarning
		>
			<body className="min-h-screen bg-background font-sans text-foreground antialiased">
				<ThemeProvider>
					<AuthProvider>
						<ConvexClientProvider>
							<TRPCReactProvider>
								<SiteHeader />
								<AppShell>{children}</AppShell>
								<Toaster />
								<AppServiceWorker />
							</TRPCReactProvider>
						</ConvexClientProvider>
					</AuthProvider>
				</ThemeProvider>
			</body>
		</html>
	);
}
