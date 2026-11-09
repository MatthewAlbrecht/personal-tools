# 05: Stars

**What to build:** I can star a unit from its row or its drawer, and star a whole floor plan (from the drawer's floor-plan fact and from a control on the page). A unit counts as starred if it or its floor plan is; plan-starred units show a lighter star. Starred units pin to the top of the Ledger in bold, and an All / Starred / New filter with counts narrows the list ("New" = listed in the last 7 days). Stars are stored in Convex so they match across devices. With the page complete, the prototype route is deleted.

**Blocked by:** 03 (Price changes and the unit drawer)

**Status:** done

Spec: docs/superpowers/specs/2026-11-08-henry-tracker-design.md (Stars; The page; stories 16–17, 33–36)

- [x] Auth-wrapped mutations: toggle unit star, toggle floor-plan star
- [x] Page and details queries say whether a unit is starred directly or via its plan
- [x] Star buttons on rows and in the drawer (direct vs plan-starred look), floor-plan star control
- [x] Starred units pinned to the top in bold; All / Starred / New filter with counts (shadcn ToggleGroup)
- [x] convex-test covers toggling, plan stars covering current and later-listed units
- [x] The prototype route `src/app/prototypes/henry/` is deleted

## Notes from the build

- **Tables** (`convex/schema.ts`, new; no migration): `henryStarredUnits { unitId: Id<"henryUnits">, starredAt }` with `by_unitId`, and `henryStarredPlans { floorPlan: string, starredAt }` with `by_floorPlan`. One row per star; unstarring deletes it. A unit star is keyed by the unit row, so it survives going off the market and relisting.
- **Mutations** (`convex/henry/stars.ts`, public, `requireAuth`): `api.henry.stars.toggleUnitStar({ unitId })` and `api.henry.stars.toggleFloorPlanStar({ floorPlan })`, each → `boolean` (starred now). The plan is trimmed; blank or over 20 characters throws a `ConvexError`. An unknown unit id throws. Logic is in `convex/model/henry/stars.ts`.
- **Reusable "is starred" (tickets 06–07)**: `isStarred(ctx: QueryCtx, unit: Pick<Doc<"henryUnits">, "_id" | "floorPlan">): Promise<boolean>` in `convex/model/henry/stars.ts` (true for a direct or a plan star; `MutationCtx` works too). `readStar(ctx, unit, starredPlans?)` → `{ unitStarred, planStarred }` and `readStarredPlans(ctx)` → `string[]` (sorted, `take(100)`) are there too. Call `isStarred` in `recordUnit` at the listed/relisted branches for the star override (06) and for drop pushes (07). For 07's "dropped if no longer starred at delivery", call it again in the delivery mutation.
- **Query shapes**: every Ledger unit and `getUnit` now carry `unitStarred: boolean` (starred itself) and `planStarred: boolean` (its floor plan is). Starred = either. `henryLedgerUnitValidator` has both, so `henryUnitDetailsValidator` inherits them. `ledgerUnit(unit, changes, star, now)` takes the star as a new third argument. `getLedger` also returns `starredPlans: string[]`. Gone-this-week rows carry no star.
- **Page**: the star column comes first; there's an All / Starred / New `ToggleGroup` with counts, and a "Floor plans" `DropdownMenu` (checkbox items: each plan on the market with its bed count and how many units, plus starred plans with none listed) to its right. Starred rows pin to the top within the current sort, in bold on `bg-muted/40`. Pure helpers are in `src/lib/henry/stars.ts` (`isStarred`, `pinStarred`, `filterUnits`, `filterCounts`, `planSummaries`; `stars.test.ts`). The page sorts, then filters, then pins.
- **Drawer**: the unit star sits at the end of the title row. The Floor plan fact has its own star, with "· starred" after the plan name while it's starred. `StarButton` (`_components/star-button.tsx`): filled when starred itself, a lighter `fill-muted-foreground/40` when only the plan is.
- **Optimistic updates**: `src/app/henry/_utils/optimistic.ts` (`toggleCachedUnitStar`, `toggleCachedPlanStar`) flips every cached `getLedger` and `getUnit`, through `useStarToggles()` (`_utils/use-star-toggles.ts`). Errors show a toast.
- **Tests**: `convex/henry/checks.test.ts` has a "stars" block: nothing starred at first, toggling a unit on and off, a plan covering its current units and a unit that lists later (609, B2), direct + plan both and each toggling alone, a star kept through off-market and relisting, `isStarred` direct/plan/neither, and a blank plan refused. The public-surface test covers both mutations.
- **Seen in a browser** (dev, 33 units): 1280 and 430, light and dark, no errors, no sideways scroll. I starred 608 and plan U1 and checked pinning, the bold rows, the lighter star on 743/437/733, the Starred filter (4) and both drawer stars. Afterwards I unstarred everything, so dev has no stars.
- **Prototype**: `src/app/prototypes/` was deleted (it was never committed).
