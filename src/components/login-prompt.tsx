"use client";

import type { LucideIcon } from "lucide-react";

type LoginPromptProps = {
	icon: LucideIcon;
	message: string;
	redirectPath: string;
};

export function LoginPrompt({
	icon: Icon,
	message,
	redirectPath,
}: LoginPromptProps) {
	return (
		<div className="container mx-auto max-w-6xl p-6">
			<div className="flex h-[50vh] flex-col items-center justify-center gap-4">
				<Icon className="h-12 w-12 text-muted-foreground" />
				<p className="text-muted-foreground">{message}</p>
				<a
					href={`/login?redirect=${encodeURIComponent(redirectPath)}`}
					className="text-primary hover:underline"
				>
					Go to login
				</a>
			</div>
		</div>
	);
}
