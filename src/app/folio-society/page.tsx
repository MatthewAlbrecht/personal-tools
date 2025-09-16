"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";
import { useQuery, useMutation } from "convex/react";
import { api as convexApi } from "~/convex/_generated/api";

// Import our new components
import { StatsSection } from "./_components/stats-section";
import { ConfigSection } from "./_components/config-section";
import { SearchSection } from "./_components/search-section";
import { ReleasesList } from "./_components/releases-list";
import { formatDate } from "./_utils/formatters";

export default function FolioSocietyPage() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUpdatingConfig, setIsUpdatingConfig] = useState(false);
  const [searchInput, setSearchInput] = useState("");

  // TRPC hooks
  const {
    data: releases,
    refetch: refetchReleases,
    isLoading: releasesLoading,
  } = api.folioSociety.getReleases.useQuery({
    limit: 50,
    sortBy: "id",
    sortOrder: "desc",
    search: searchInput || undefined,
  });

  const { data: stats } = api.folioSociety.getStats.useQuery();
  const syncMutation = api.folioSociety.syncReleases.useMutation();

  // Use Convex for config management
  const config = useQuery(convexApi.folioSociety.getConfig);
  const updateConfigMutation = useMutation(convexApi.folioSociety.updateConfig);

  const startIdPlaceholder = config?.startId?.toString() || "5130";
  const endIdPlaceholder = config?.endId?.toString() || "5300";

  async function handleSync() {
    setIsSyncing(true);
    try {
      const result = await syncMutation.mutateAsync({
        // Use configured range or defaults
      });
      console.log("Sync completed:", result);
      await refetchReleases();
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
        <Button
          onClick={handleSync}
          disabled={isSyncing}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
          {isSyncing ? "Syncing..." : "Sync from API"}
        </Button>
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