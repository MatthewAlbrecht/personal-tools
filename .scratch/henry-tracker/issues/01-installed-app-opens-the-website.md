# 01: Installed app opens the website

**What to build:** The home-screen app opens the site's home page (`/`) and is named for the whole site, not Yu-Gi-Oh. The service worker registration, the per-launch push subscription refresh and notification-tap routing run from every page, so pushes work whichever page the app opens on. A notification without a usable link opens `/`. The per-device push on/off toggle becomes a shared piece any feature page can show. Yu-Gi-Oh pushes, its settings toggle and existing installs keep working.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent (built; left for you: the phone check after a prod deploy)

Spec: docs/superpowers/specs/2026-11-08-henry-tracker-design.md (Installed app; stories 49–50, 52–55)

- [x] Manifest start URL is `/`; name and short name are the site's; the manifest `id` is unchanged so Android/desktop installs carry over
- [x] Service worker registration, subscription refresh and the notification-tap message listener run from the root layout, not only under `/yugioh` (no double registration)
- [x] The service worker's fallback URL is `/`; Yu-Gi-Oh push URLs (app paths and eBay item links) still route as before; the tap message is no longer Yu-Gi-Oh-specific
- [x] The push toggle (turn on / off / test for this device) is a shared component; Yu-Gi-Oh settings uses it unchanged in behaviour
- [x] Push subscriptions stay in the existing table, unchanged (no rename, no migration)
- [x] The existing service-worker and manifest/launch tests updated and passing; Yu-Gi-Oh push tests still pass
- [ ] Checked by hand on the phone: re-add to home screen, it opens `/`, a Yu-Gi-Oh test push arrives and opens the right page (needs prod deploy — left for the user)

Left for you: deploy to prod, then on the phone re-add the app to the home screen (iOS likely needs it), check it opens `/`, and send a Yu-Gi-Oh test alert from /yugioh/settings to see it arrive and open the right page.

## Notes from the build

- **Shared push toggle:** `src/components/push-settings.tsx`, `PushSettings({ description, label, hint })`, all strings. `description` sits under the "Notifications" card title (what this feature pushes), `label` is the switch label, `hint` sits under it (when pushes arrive). Behaviour is identical everywhere (on/off/test for this device, the iPhone add-to-home-screen steps, the blocked message), and it still calls `api.yugioh.pushes.*` (one subscription per device covers every feature). The card has `id="notifications"`, so render one per page. Yu-Gi-Oh settings passes its old copy unchanged. Its Zod schema now lives inside the component (removed from `yugioh/_utils/schemas.ts`).
- **Browser push helpers** moved to `src/lib/push.ts` (`pushSupport`, `currentSubscription`, `subscribeThisDevice`, `subscriptionArgs`). `errorMessage` moved to `src/lib/error-message.ts`; `src/app/yugioh/_utils/errors.ts` re-exports it so the 12 Yu-Gi-Oh importers didn't change.
- **Root-layout worker setup:** `src/components/app-service-worker.tsx` (`AppServiceWorker`) is mounted once in `src/app/layout.tsx` (inside Auth and Convex providers). It is no longer in `yugioh/layout.tsx`. It has three effects: it registers `/sw.js` (scope `/`) on mount; once `useAuth().isAuthenticated` is true it waits for `serviceWorker.ready` and re-saves this device's subscription (so it does nothing while signed out at /login); and it listens for tap messages and `router.push`es same-origin paths.
- **Generic open message:** `public/sw.js` posts `{ type: "app-open", url }` to an open window. The page also still accepts the old `"yugioh-open"` from workers that haven't updated yet. Taps with no usable link (or another origin) open `/`. eBay item URLs still open directly. A malformed push shows "moooose" / "Something changed. Tap to see it." and opens `/`. Any same-origin path (for example `/henry?unit=…`) routes, so Henry pushes only need a `url`.
- **Manifest:** name and short name are "moooose", `start_url` is `/`, and `id` stays `/yugioh` (see the comment in `src/app/manifest.ts`). `appleWebApp` (title "moooose") and the apple icon moved from the Yu-Gi-Oh layout to the root metadata. The Yu-Gi-Oh layout keeps its page title and light `themeColor`.
- **Tests:** `src/lib/yugioh/service-worker.test.ts` (extended) and the new `src/lib/yugioh/manifest.test.ts`. The manifest test sits under `src/lib/yugioh/` only because `vitest.config.ts` collects listed paths (and was left alone, as it has uncommitted user edits). Moving it next to `src/app/manifest.ts` needs an include entry.
