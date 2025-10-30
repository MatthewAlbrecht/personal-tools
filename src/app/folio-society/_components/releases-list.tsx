import { Package } from "lucide-react";
import type { ConvexRelease } from "../_utils/types";
import { ReleaseItem, ReleaseItemSkeleton } from "./release-item";

export function ReleasesList({
	releases,
	isLoading,
}: {
	releases?: ConvexRelease[] | null;
	isLoading: boolean;
}) {
	if (isLoading) {
		return (
			<div className="space-y-4">
				{Array.from({ length: 3 }).map((_, i) => (
					<ReleaseItemSkeleton
						// biome-ignore lint/suspicious/noArrayIndexKey: biome is dumb
						key={i}
					/>
				))}
			</div>
		);
	}

	if (!releases || releases.length === 0) {
		return (
			<div className="py-8 text-center text-muted-foreground">
				<Package className="mx-auto mb-4 h-12 w-12 opacity-50" />
				<p>No releases found. Click "Sync from API" to fetch data.</p>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{releases.map((release) => (
				<ReleaseItem key={release.id} release={release} />
			))}
		</div>
	);
}
