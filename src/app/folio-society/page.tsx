"use client";

import {
	Calendar,
	DollarSign,
	ExternalLink,
	Package,
	RefreshCw,
	Settings,
} from "lucide-react";
import { useState } from "react";
import { ImageGallery } from "~/components/ImageGallery";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { InputGroup } from "~/components/ui/input-group";
import { Label } from "~/components/ui/label";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "~/trpc/react";

export default function FolioSocietyPage() {
	const [isSyncing, setIsSyncing] = useState(false);
	const [startIdInput, setStartIdInput] = useState("");
	const [endIdInput, setEndIdInput] = useState("");

	// TRPC hooks
	const { data: releases, refetch: refetchReleases } =
		api.folioSociety.getReleases.useQuery({
			limit: 500,
			sortBy: "id",
			sortOrder: "desc",
		});

	const { data: stats } = api.folioSociety.getStats.useQuery();
	const { data: config } = api.folioSociety.getConfig.useQuery();
	const syncMutation = api.folioSociety.syncReleases.useMutation();
	const updateConfigMutation = api.folioSociety.updateConfig.useMutation();

	const handleSync = async () => {
		setIsSyncing(true);
		try {
			const result = await syncMutation.mutateAsync({
				// Use configured range or defaults
			});
			console.log("Sync completed:", result);
			await refetchReleases();
		} catch (error) {
			console.error("Sync failed:", error);
			alert("Failed to sync releases. Check console for details.");
		} finally {
			setIsSyncing(false);
		}
	};

	const handleUpdateConfig = async () => {
		try {
			const startId = Number.parseInt(startIdInput);
			const endId = Number.parseInt(endIdInput);

			if (Number.isNaN(startId) || Number.isNaN(endId)) {
				alert("Please enter valid numbers for start and end IDs.");
				return;
			}

			await updateConfigMutation.mutateAsync({
				startId,
				endId,
			});

			setStartIdInput("");
			setEndIdInput("");
			alert("Configuration updated successfully!");
		} catch (error) {
			console.error("Config update failed:", error);
			alert("Failed to update configuration. Check console for details.");
		}
	};

	const formatPrice = (price?: number | null) => {
		if (!price) return "N/A";
		return `$${price.toFixed(2)}`;
	};

	const formatDate = (date: Date) => {
		return new Intl.DateTimeFormat("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		}).format(new Date(date));
	};

	const generateImageUrls = (
		sku: string,
		existingImagePath?: string | null,
	) => {
		const baseUrl = "https://www.foliosociety.com/static/media/catalog/product";
		const skuLower = sku.toLowerCase();
		const urls = [];

		// Extract directory from existing image path if available
		let directory: string | undefined = "2/2"; // default fallback
		if (existingImagePath) {
			const match = existingImagePath.match(/\/product\/([^/]+\/[^/]+)\//);
			if (match) {
				directory = match[1];
			}
		}

		// Image variants to try
		const variants = [
			`${skuLower}_1_base.jpg`,
			`${skuLower}_01_base.jpg`,
			`${skuLower}_base.jpg`,
			`${skuLower}_2_hover.jpg`,
			`${skuLower}_02_hover.jpg`,
			`${skuLower}_hover.jpg`,
		];

		// Add numbered variants 3-12
		for (let i = 3; i <= 12; i++) {
			variants.push(`${skuLower}_${i}.jpg`);
			if (i < 10) {
				variants.push(`${skuLower}_0${i}.jpg`);
			}
		}

		// Generate URLs using the known directory
		for (const variant of variants) {
			urls.push(`${baseUrl}/${directory}/${variant}`);
		}

		return urls;
	};

	return (
		<div className="container mx-auto max-w-6xl p-6">
			<div className="mb-6 flex items-center justify-between">
				<div>
					<h1 className="font-bold text-3xl">Folio Society Release Tracker</h1>
					<p className="mt-2 text-muted-foreground">
						Track upcoming and current Folio Society book releases
					</p>
				</div>
				<Button
					onClick={handleSync}
					disabled={isSyncing}
					className="flex items-center gap-2"
				>
					<RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
					{isSyncing ? "Syncing..." : "Sync from API"}
				</Button>
			</div>

			{/* Statistics Cards */}
			{stats && (
				<div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
					<Card>
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="font-medium text-sm">
								Total Releases
							</CardTitle>
							<Package className="h-4 w-4 text-muted-foreground" />
						</CardHeader>
						<CardContent>
							<div className="font-bold text-2xl">{stats.total}</div>
							<p className="text-muted-foreground text-xs">
								{stats.active} active, {stats.inactive} inactive
							</p>
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="font-medium text-sm">
								Recent Additions
							</CardTitle>
							<Calendar className="h-4 w-4 text-muted-foreground" />
						</CardHeader>
						<CardContent>
							<div className="font-bold text-2xl">{stats.recent}</div>
							<p className="text-muted-foreground text-xs">Last 30 days</p>
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="font-medium text-sm">Last Sync</CardTitle>
							<RefreshCw className="h-4 w-4 text-muted-foreground" />
						</CardHeader>
						<CardContent>
							<div className="font-medium text-sm">
								{stats.lastSync ? formatDate(stats.lastSync) : "Never"}
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="font-medium text-sm">Active Rate</CardTitle>
							<DollarSign className="h-4 w-4 text-muted-foreground" />
						</CardHeader>
						<CardContent>
							<div className="font-bold text-2xl">
								{stats.total > 0
									? Math.round((stats.active / stats.total) * 100)
									: 0}
								%
							</div>
							<p className="text-muted-foreground text-xs">
								Currently available
							</p>
						</CardContent>
					</Card>
				</div>
			)}

			{/* Settings */}
			<Card className="mb-6">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Settings className="h-5 w-5" />
						Configuration
					</CardTitle>
					<CardDescription>
						Configure the ID range for API syncing. Current range:{" "}
						{config?.startId || 5130} - {config?.endId || 5300}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex items-end gap-4">
						<InputGroup label="Start ID" htmlFor="startId" className="flex-1">
							<Input
								id="startId"
								type="number"
								placeholder={config?.startId?.toString() || "5130"}
								value={startIdInput}
								onChange={(e) => setStartIdInput(e.target.value)}
							/>
						</InputGroup>
						<InputGroup label="End ID" htmlFor="endId" className="flex-1">
							<Input
								id="endId"
								type="number"
								placeholder={config?.endId?.toString() || "5300"}
								value={endIdInput}
								onChange={(e) => setEndIdInput(e.target.value)}
							/>
						</InputGroup>
						<Button
							onClick={handleUpdateConfig}
							disabled={updateConfigMutation.isPending}
							variant="outline"
						>
							Update Range
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* Releases List */}
			<Card>
				<CardHeader>
					<CardTitle>Releases</CardTitle>
					<CardDescription>
						{releases?.length || 0} releases found, sorted by ID (newest first)
					</CardDescription>
				</CardHeader>
				<CardContent>
					{!releases || releases.length === 0 ? (
						<div className="py-8 text-center text-muted-foreground">
							<Package className="mx-auto mb-4 h-12 w-12 opacity-50" />
							<p>No releases found. Click "Sync from API" to fetch data.</p>
						</div>
					) : (
						<div className="space-y-4">
							{releases.map((release) => (
								<div
									key={release.id}
									className="flex items-start justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50"
								>
									<div className="min-w-0 flex-1">
										<div className="mb-2 flex items-center gap-2">
											<h3 className="truncate font-semibold text-lg">
												{release.name}
											</h3>
											<Badge
												variant={release.isActive ? "default" : "secondary"}
											>
												{release.isActive ? "Active" : "Inactive"}
											</Badge>
										</div>

										<div className="mb-2 flex items-center gap-4 text-muted-foreground text-sm">
											<span className="flex items-center gap-1">
												<span className="font-medium">ID:</span> {release.id}
											</span>
											<span className="flex items-center gap-1">
												<span className="font-medium">SKU:</span> {release.sku}
											</span>
											<span className="flex items-center gap-1">
												<span className="font-medium">Price:</span>{" "}
												{formatPrice(release.price)}
											</span>
										</div>

										<div className="flex items-center gap-4 text-muted-foreground text-xs">
											<span>First seen: {formatDate(release.firstSeenAt)}</span>
											<span>Last seen: {formatDate(release.lastSeenAt)}</span>
										</div>

										<ImageGallery
											imageUrls={generateImageUrls(release.sku, release.image)}
										/>
									</div>

									<div className="ml-4 flex items-center gap-2">
										<Button variant="outline" size="sm" asChild>
											<a
												href={`https://www.foliosociety.com${release.url}`}
												target="_blank"
												rel="noopener noreferrer"
												className="flex items-center gap-1"
											>
												<ExternalLink className="h-3 w-3" />
												View
											</a>
										</Button>
									</div>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>

			{syncMutation.error && (
				<div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 p-4">
					<p className="font-medium text-destructive">Sync Error</p>
					<p className="mt-1 text-destructive/80 text-sm">
						{syncMutation.error.message}
					</p>
				</div>
			)}
		</div>
	);
}
