"use client";

import type { ReactNode } from "react";
import { Label } from "~/components/ui/label";
import { cn } from "~/lib/utils";

export function ZineField({
	label,
	htmlFor,
	placement,
	children,
	className,
}: {
	label: string;
	htmlFor?: string;
	placement?: string;
	children: ReactNode;
	className?: string;
}): ReactNode {
	return (
		<div className={cn("space-y-1.5", className)}>
			<Label htmlFor={htmlFor}>{label}</Label>
			{children}
			{placement ? (
				<p className="text-muted-foreground text-xs">{placement}</p>
			) : null}
		</div>
	);
}
