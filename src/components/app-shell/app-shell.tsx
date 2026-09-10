"use client";

import { AppSidebar } from "~/components/app-shell/app-sidebar";
import { useAuth } from "~/lib/auth-context";
import { cn } from "~/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
	const { isAuthenticated } = useAuth();

	return (
		<div className="min-h-[calc(100vh-3.5rem)] md:flex">
			{isAuthenticated ? (
				<aside
					className={cn(
						"sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 overflow-y-auto border-stone-900/10 border-r bg-[#efeeea] md:block",
					)}
				>
					<AppSidebar />
				</aside>
			) : null}
			<div className="min-w-0 flex-1">{children}</div>
		</div>
	);
}
