import type { Doc } from "convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import type { RouterOutputs } from "~/trpc/react";
import type { api } from "../../../../convex/_generated/api";

// Convex types - preferred for new functionality
export type ConvexRelease = FunctionReturnType<
	typeof api.folioSocietyReleases.getReleases
>[number];
export type ConvexStats = FunctionReturnType<
	typeof api.folioSocietyReleases.getStats
>;
export type ConvexConfig = FunctionReturnType<
	typeof api.folioSociety.getConfig
>;

// Legacy TRPC types - will be removed after migration
export type Release = Doc<"folioSocietyReleases">;
export type Stats = Doc<"folioSocietyReleases">;
export type Config = FunctionReturnType<typeof api.folioSociety.getConfig>;
