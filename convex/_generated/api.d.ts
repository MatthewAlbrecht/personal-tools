/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as auth from "../auth.js";
import type * as bookSearch from "../bookSearch.js";
import type * as folioSociety from "../folioSociety.js";
import type * as folioSocietyDetails from "../folioSocietyDetails.js";
import type * as folioSocietyReleases from "../folioSocietyReleases.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  bookSearch: typeof bookSearch;
  folioSociety: typeof folioSociety;
  folioSocietyDetails: typeof folioSocietyDetails;
  folioSocietyReleases: typeof folioSocietyReleases;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
