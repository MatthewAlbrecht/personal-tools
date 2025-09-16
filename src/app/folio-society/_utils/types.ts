import type { RouterOutputs } from '~/trpc/react';
import type { api } from '../../../../convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';

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
export type Release = RouterOutputs['folioSociety']['getReleases'][number];
export type Stats = RouterOutputs['folioSociety']['getStats'];
export type Config = FunctionReturnType<typeof api.folioSociety.getConfig>;
