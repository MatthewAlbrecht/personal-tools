"use client";

import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";

export function OpenRymLinksButton({
	links,
	disabled,
}: {
	links: Array<{ id: string; url: string }>;
	disabled?: boolean;
}) {
	function handleOpen(): void {
		if (links.length === 0) {
			toast.message("No RYM links in the current filter");
			return;
		}

		for (const link of links) {
			window.open(link.url, "_blank", "noopener,noreferrer");
		}

		toast.success(
			`Opened ${links.length} RYM link${links.length === 1 ? "" : "s"}`,
		);
	}

	return (
		<Button
			type="button"
			variant="outline"
			className="gap-2"
			onClick={handleOpen}
			disabled={disabled || links.length === 0}
		>
			<ExternalLink className="h-4 w-4" />
			Open {links.length} RYM link{links.length === 1 ? "" : "s"}
		</Button>
	);
}
