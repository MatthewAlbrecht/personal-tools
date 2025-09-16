import type { RouterOutputs } from '~/trpc/react';
import type { api } from '~/convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';

// Infer types from TRPC router outputs - this is the proper way!
export type Release = RouterOutputs['folioSociety']['getReleases'][number];
export type Stats = RouterOutputs['folioSociety']['getStats'];

// Infer types from Convex function returns
export type Config = FunctionReturnType<typeof api.folioSociety.getConfig>;
