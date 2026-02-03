import "~/styles/globals.css";

import type { Metadata } from "next";
import { SiteHeader } from "~/app/_components/site-header";
import { Toaster } from "~/components/ui/sonner";
import { AuthProvider } from "~/lib/auth-context";
import ConvexClientProvider from "~/providers/ConvexProvider";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
	title: "moooose",
	description: "moooose.dev",
	icons: [{ rel: "icon", url: "/favicon.svg" }],
};

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en">
			<body>
				<AuthProvider>
					<ConvexClientProvider>
						<TRPCReactProvider>
							<SiteHeader />
							{children}
							<Toaster />
						</TRPCReactProvider>
					</ConvexClientProvider>
				</AuthProvider>
			</body>
		</html>
	);
}
