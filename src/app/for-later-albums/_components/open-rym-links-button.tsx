"use client";

import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";

export function openVisibleRymLinks(
	links: Array<{ id: string; url: string }>,
): void {
	if (links.length === 0) {
		toast.message("No albums match the current filter");
		return;
	}

	for (const link of links) {
		window.open(link.url, "_blank", "noopener,noreferrer");
	}

	toast.success(
		`Opened ${links.length} Google RYM search tab${links.length === 1 ? "" : "s"}`,
	);
}

export function OpenRymLinksButton({
	links,
	disabled,
}: {
	links: Array<{ id: string; url: string }>;
	disabled?: boolean;
}) {
	return (
		<Button
			type="button"
			variant="outline"
			className="gap-2"
			onClick={() => openVisibleRymLinks(links)}
			disabled={disabled || links.length === 0}
		>
			<ExternalLink className="h-4 w-4" />
			Open {links.length} Google RYM tab{links.length === 1 ? "" : "s"}
		</Button>
	);
}
