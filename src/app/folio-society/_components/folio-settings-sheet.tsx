"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { Settings } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Separator } from "~/components/ui/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "~/components/ui/sheet";
import { api } from "../../../../convex/_generated/api";

export function FolioSettingsSheet(): ReactNode {
	const config = useQuery(api.folioSociety.getConfig);
	const updateConfig = useMutation(api.folioSociety.updateConfig);
	const startBackfill = useMutation(
		api.folioSocietyBackfill.startFolioCatalogBackfill,
	);
	const syncReleases = useAction(api.folioSocietyReleases.syncReleases);
	const enrichDetails = useAction(api.folioSocietyDetails.enrichDetails);
	const processAllImages = useAction(api.folioSocietyImages.processAllImages);

	const [startIdInput, setStartIdInput] = useState("");
	const [endIdInput, setEndIdInput] = useState("");
	const [isSyncing, setIsSyncing] = useState(false);
	const [isEnriching, setIsEnriching] = useState(false);
	const [isProcessingImages, setIsProcessingImages] = useState(false);
	const [isSavingRange, setIsSavingRange] = useState(false);
	const [isStartingBackfill, setIsStartingBackfill] = useState(false);

	useEffect(() => {
		if (!config) {
			return;
		}
		setStartIdInput(String(config.startId));
		setEndIdInput(String(config.endId));
	}, [config]);

	const backfillStatus =
		config && "backfillStatus" in config ? config.backfillStatus : undefined;
	const backfillRunning = backfillStatus === "running";
	const backfillError = backfillStatus === "error";

	async function handleSync(): Promise<void> {
		setIsSyncing(true);
		try {
			await syncReleases({});
			toast("Sync finished.");
		} catch {
			toast.error("Sync failed.");
		} finally {
			setIsSyncing(false);
		}
	}

	async function handleEnrich(): Promise<void> {
		setIsEnriching(true);
		try {
			await enrichDetails({
				detailsTtlHours: 24,
				maxConcurrent: 10,
				limit: 600,
			});
		} catch {
			toast.error("Enrichment failed.");
		} finally {
			setIsEnriching(false);
		}
	}

	async function handleProcessImages(): Promise<void> {
		setIsProcessingImages(true);
		try {
			await processAllImages({
				batchSize: 5,
				maxConcurrent: 2,
			});
		} catch {
			toast.error("Image processing failed.");
		} finally {
			setIsProcessingImages(false);
		}
	}

	async function handleSaveRange(): Promise<void> {
		const startId = Number.parseInt(startIdInput, 10);
		const endId = Number.parseInt(endIdInput, 10);
		if (Number.isNaN(startId) || Number.isNaN(endId)) {
			return;
		}
		if (config && startId === config.startId && endId === config.endId) {
			return;
		}
		setIsSavingRange(true);
		try {
			await updateConfig({ startId, endId });
		} catch {
			toast.error("Couldn’t update range.");
		} finally {
			setIsSavingRange(false);
		}
	}

	async function handleStartBackfill(): Promise<void> {
		setIsStartingBackfill(true);
		try {
			await startBackfill({});
		} catch {
			toast.error("Sync failed.");
		} finally {
			setIsStartingBackfill(false);
		}
	}

	return (
		<Sheet>
			<SheetTrigger asChild>
				<Button type="button" variant="outline" size="sm">
					<Settings className="h-4 w-4" />
					Settings
				</Button>
			</SheetTrigger>
			<SheetContent>
				<SheetHeader>
					<SheetTitle className="font-[family-name:var(--font-display)] text-lg">
						Settings
					</SheetTitle>
					<SheetDescription>Range and catalog jobs.</SheetDescription>
				</SheetHeader>

				<div className="flex flex-col gap-4 px-4 pb-6">
					<Button
						type="button"
						variant="outline"
						onClick={handleSync}
						disabled={isSyncing}
					>
						{isSyncing ? "Syncing…" : "Sync"}
					</Button>
					<Button
						type="button"
						variant="outline"
						onClick={handleEnrich}
						disabled={isEnriching}
					>
						{isEnriching ? "Enriching…" : "Enrich details"}
					</Button>
					<Button
						type="button"
						variant="outline"
						onClick={handleProcessImages}
						disabled={isProcessingImages}
					>
						{isProcessingImages ? "Processing images…" : "Process images"}
					</Button>

					<Separator />

					<fieldset className="m-0 min-w-0 space-y-3 border-0 p-0">
						<legend className="mb-1.5 font-medium text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]">
							ID range
						</legend>
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-1.5">
								<Label htmlFor="folio-range-start">Start</Label>
								<Input
									id="folio-range-start"
									type="number"
									value={startIdInput}
									placeholder={config ? String(config.startId) : undefined}
									onChange={(event) => setStartIdInput(event.target.value)}
									onBlur={handleSaveRange}
									disabled={isSavingRange}
									className="h-8 px-2.5 text-xs shadow-none"
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="folio-range-end">End</Label>
								<Input
									id="folio-range-end"
									type="number"
									value={endIdInput}
									placeholder={config ? String(config.endId) : undefined}
									onChange={(event) => setEndIdInput(event.target.value)}
									onBlur={handleSaveRange}
									disabled={isSavingRange}
									className="h-8 px-2.5 text-xs shadow-none"
								/>
							</div>
						</div>
					</fieldset>

					{backfillRunning ? (
						<p className="text-muted-foreground text-sm">Dates filling in</p>
					) : (
						<Button
							type="button"
							variant="outline"
							onClick={handleStartBackfill}
							disabled={isStartingBackfill}
						>
							Fill dates
						</Button>
					)}
					{backfillError ? (
						<p className="text-muted-foreground text-sm">
							Couldn’t fill dates.
						</p>
					) : null}
				</div>
			</SheetContent>
		</Sheet>
	);
}
