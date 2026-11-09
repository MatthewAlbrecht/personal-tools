# 05: Stars

**What to build:** I can star a unit from its row or its drawer, and star a whole floor plan (from the drawer's floor-plan fact and from a control on the page). A unit counts as starred if it or its floor plan is; plan-starred units show a lighter star. Starred units pin to the top of the Ledger in bold, and an All / Starred / New filter with counts narrows the list ("New" = listed in the last 7 days). Stars are stored in Convex so they match across devices. With the page complete, the prototype route is deleted.

**Blocked by:** 03 (Price changes and the unit drawer)

**Status:** ready-for-agent

Spec: docs/superpowers/specs/2026-11-08-henry-tracker-design.md (Stars; The page; stories 16–17, 33–36)

- [ ] Auth-wrapped mutations: toggle unit star, toggle floor-plan star
- [ ] Page and details queries say whether a unit is starred directly or via its plan
- [ ] Star buttons on rows and in the drawer (direct vs plan-starred look), floor-plan star control
- [ ] Starred units pinned to the top in bold; All / Starred / New filter with counts (shadcn ToggleGroup)
- [ ] convex-test covers toggling, plan stars covering current and later-listed units
- [ ] The prototype route `src/app/prototypes/henry/` is deleted
