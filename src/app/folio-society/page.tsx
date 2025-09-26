"use client";

import { RefreshCw, Database } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { useQuery, useMutation, useAction } from "convex/react";
import { api as convexApi } from "../../../convex/_generated/api";
import { useDebouncedState } from "~/lib/hooks/use-debounced-state";

// Import our new components
import { StatsSection } from "./_components/stats-section";
import { ConfigSection } from "./_components/config-section";
import { SearchSection } from "./_components/search-section";
import { ReleasesList } from "./_components/releases-list";
import { formatDate } from "./_utils/formatters";

export default function FolioSocietyPage() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUpdatingConfig, setIsUpdatingConfig] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [searchInput, debouncedSearchInput, setSearchInput] = useDebouncedState("", 300);

  // Convex hooks
  const releases = useQuery(convexApi.folioSocietyReleases.getReleases, {
    limit: 50,
    sortBy: "id",
    sortOrder: "desc",
    search: debouncedSearchInput || undefined,
  });

  const stats = useQuery(convexApi.folioSocietyReleases.getStats);
  const config = useQuery(convexApi.folioSociety.getConfig);

  const syncAction = useAction(convexApi.folioSocietyReleases.syncReleases);
  const updateConfigMutation = useMutation(convexApi.folioSociety.updateConfig);
  const enrichAction = useAction(convexApi.folioSocietyDetails.enrichDetails);

  const releasesLoading = releases === undefined;

  const startIdPlaceholder = config?.startId?.toString() || "5130";
  const endIdPlaceholder = config?.endId?.toString() || "5300";

  async function handleSync() {
    setIsSyncing(true);
    try {
      const result = await syncAction({
        // Use configured range or defaults
      });
      console.log("Sync completed:", result);
      toast.success("Releases synced successfully!");
    } catch (error) {
      console.error("Sync failed:", error);
      toast.error("Failed to sync releases. Check console for details.");
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleUpdateConfig(startId: number, endId: number) {
    setIsUpdatingConfig(true);
    try {
      await updateConfigMutation({
        startId,
        endId,
      });
      toast.success("Configuration updated successfully!");
    } catch (error) {
      console.error("Config update failed:", error);
      toast.error("Failed to update configuration. Check console for details.");
      throw error; // Re-throw so the component can handle it
    } finally {
      setIsUpdatingConfig(false);
    }
  }

  async function handleFullEnrichment() {
    setIsEnriching(true);
    try {
      const result = await enrichAction({
        // Force refresh all products by setting TTL to 0 (no product filter needed)
        detailsTtlHours: 0,
        maxConcurrent: 10,
        limit: 600, // High limit for full enrichment
      });
      console.log("Full enrichment completed:", result);
      toast.success(`Full enrichment completed! Processed ${result.attempted} products.`);
    } catch (error) {
      console.error("Full enrichment failed:", error);
      toast.error("Failed to run full enrichment. Check console for details.");
    } finally {
      setIsEnriching(false);
    }
  }



  return (
    <div className="container mx-auto max-w-6xl p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-3xl">Folio Society Release Tracker</h1>
          <p className="mt-2 text-muted-foreground">
            Track upcoming and current Folio Society book releases
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleSync}
            disabled={isSyncing}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Syncing..." : "Sync from API"}
          </Button>
          <Button
            onClick={handleFullEnrichment}
            disabled={isEnriching}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Database className={`h-4 w-4 ${isEnriching ? "animate-spin" : ""}`} />
            {isEnriching ? "Enriching..." : "Full Enrichment"}
          </Button>
        </div>
      </div>

      {/* Stats Section */}
      <StatsSection stats={stats} formatDate={formatDate} />

      {/* Configuration Section */}
      <ConfigSection
        config={config}
        isUpdatingConfig={isUpdatingConfig}
        startIdPlaceholder={startIdPlaceholder}
        endIdPlaceholder={endIdPlaceholder}
        formatDate={formatDate}
        onUpdateConfig={handleUpdateConfig}
      />

      {/* Search Section */}
      <SearchSection
        searchInput={searchInput}
        onSearchChange={setSearchInput}
      />

      {/* Releases List */}
      <ReleasesList
        releases={releases || []}
        isLoading={releasesLoading}
      />
    </div>
  );
}