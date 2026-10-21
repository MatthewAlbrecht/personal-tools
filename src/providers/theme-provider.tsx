"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type * as React from "react";

/**
 * next-themes with `attribute="class"` (the `.dark` variant in globals.css).
 * Defaults to light because the app shell still hardcodes light colours;
 * switch `defaultTheme` to "system" once it uses semantic tokens. Set
 * `localStorage.theme = "dark"` to check a screen in dark mode.
 */
export function ThemeProvider({
	children,
}: {
	children: React.ReactNode;
}): React.ReactElement {
	return (
		<NextThemesProvider
			attribute="class"
			defaultTheme="light"
			enableSystem
			disableTransitionOnChange
		>
			{children}
		</NextThemesProvider>
	);
}
