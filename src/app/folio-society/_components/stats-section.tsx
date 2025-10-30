import { Calendar, Package, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import type { ConvexStats } from "../_utils/types";

export function StatsSection({
	stats,
	formatDate,
}: {
	stats?: ConvexStats | null;
	formatDate: (date: Date | number | string) => string;
}) {
	return (
		<div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
			{/* Total Releases */}
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="font-medium text-sm">Total Releases</CardTitle>
					<Package className="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					{stats ? (
						<>
							<div className="font-bold text-2xl">{stats.total}</div>
							<p className="text-muted-foreground text-xs">
								Total releases tracked
							</p>
						</>
					) : (
						<StatsCardSkeleton />
					)}
				</CardContent>
			</Card>

			{/* Recent Additions */}
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="font-medium text-sm">
						Recent Additions
					</CardTitle>
					<Calendar className="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					{stats ? (
						<>
							<div className="font-bold text-2xl">{stats.recent}</div>
							<p className="text-muted-foreground text-xs">Last 30 days</p>
						</>
					) : (
						<StatsCardSkeleton />
					)}
				</CardContent>
			</Card>

			{/* Last Sync */}
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="font-medium text-sm">Last Sync</CardTitle>
					<RefreshCw className="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					{stats ? (
						<div className="font-medium text-sm">
							{stats.lastSync ? formatDate(stats.lastSync) : "Never"}
						</div>
					) : (
						<Skeleton className="h-5 w-32" />
					)}
				</CardContent>
			</Card>
		</div>
	);
}

function StatsCardSkeleton() {
	return (
		<>
			<Skeleton className="mb-1 h-8 w-16" />
			<Skeleton className="h-3 w-24" />
		</>
	);
}
