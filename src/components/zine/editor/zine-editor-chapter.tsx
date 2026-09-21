"use client";

import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

export function ZineEditorChapter({
	id,
	title,
	description,
	children,
	className,
}: {
	id: string;
	title: string;
	description?: string;
	children: ReactNode;
	className?: string;
}): ReactNode {
	return (
		<section id={id} className={cn("scroll-mt-28 space-y-5", className)}>
			<div className="space-y-1 border-border/40 border-b pb-3">
				<h2 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
					{title}
				</h2>
				{description ? (
					<p className="text-muted-foreground text-sm">{description}</p>
				) : null}
			</div>
			{children}
		</section>
	);
}
