# Automated Chrome capture run (MV3 extension, LaunchAgent)

Platform facts for the scheduled capture run. A bash script, started by a user LaunchAgent every 3 hours or run by hand, launches Google Chrome (stable, branded) with a dedicated `--user-data-dir`. The MV3 extension's service worker opens marketplace pages one at a time, gets each result back from a content script, and then the script quits that Chrome. Checked on 2026-10-20 against developer.chrome.com, Chromium source (`chromium.googlesource.com`, `main` branch), Apple docs, and the local `man` pages on macOS 26.3 with Chrome 155.0.8059.85 installed. **Verified** means a primary source says it. **Unverified** means no primary source was found, so treat it as a guess.

## Key facts

- **A `setTimeout` sleep of 20–40 s in the service worker can get the worker killed.** The worker stops after 30 s with no events and no extension API calls. Timers are cancelled when it stops (verified, see §1). Store the queue position in `chrome.storage`, and either schedule the next step with `chrome.alarms` (30 s minimum) or make sure some event or API call happens at least every 30 s.
- **`--load-extension` does nothing in branded Google Chrome 137 and later** (verified). An extension added with *Load unpacked* is saved in that profile's prefs and loads again on every start (verified in Chromium source). An extension loaded from the command line is not saved.
- **The unpacked extension ID is a SHA-256 hash of the extension's folder path** when the manifest has no `"key"` (verified). The same folder path gives the same ID in every profile.
- **Chrome allows one browser process per user-data-dir** (verified). Your normal Chrome (default dir) and the capture Chrome (custom dir) can run side by side. Launching a second Chrome on the same dir passes its command line to the running one and then exits.
- **SIGTERM to the main Chrome process on macOS runs Chrome's "session ending" path** (verified). It writes prefs and session data, then exits with code 0. It does not run page unload handlers. To find the PID, read the `SingletonLock` symlink in the user-data-dir (`<host>-<pid>`).
- **`StartInterval` skips intervals that fall while the Mac sleeps, and intervals that fall while the job is still running** (verified, `man launchd.plist`). `StartCalendarInterval` runs once on wake, folding any missed runs into one.
- **A user LaunchAgent runs in the `Aqua` (GUI) session by default and can launch GUI apps** (verified, TN2083). Use `launchctl bootstrap gui/$(id -u) <plist>`.
- **When the job's main process exits, launchd kills anything left in the job's process group** unless `AbandonProcessGroup` is true (verified). This matters if the script runs the Chrome binary directly.

## 1. MV3 service worker lifetime

Sources: [Service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle), [Longer extension service worker lifetimes (Chrome 110)](https://developer.chrome.com/blog/longer-esw-lifetimes), [Migrate to a service worker](https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers).

- **Idle timeout (verified, lifecycle).** Chrome may stop the worker "after 30 seconds of inactivity". "Receiving an event or calling an extension API resets this timer."
- **Hard limits (verified, lifecycle).** The worker is stopped "when a single request, such as an event or API call, takes longer than 5 minutes to process", or "when a `fetch()` response takes more than 30 seconds to arrive".
- **Chrome 110 (verified, blog).** Removed the old fixed 5-minute maximum lifetime. "All events reset the idle timer and the idle timeout will not occur if there are pending events." Calls to extension APIs such as `chrome.storage.local.get()` also reset it.
- **Changes by version (verified, lifecycle page).**
  - 105: an open native messaging port keeps the worker alive.
  - 109: messages from an offscreen document reset the timers.
  - 110: extension API calls reset the timers.
  - 114: long-lived messaging (ports) keeps the worker alive.
  - 116: WebSocket messages reset the timer.
  - 118: an active debugger session keeps the worker alive.
  - 120: alarms can repeat as often as every 30 s.
- **Timers (verified, migrate page).** `setTimeout` and `setInterval` "can fail in service workers … because the timers are canceled whenever the service worker is terminated". The page says to use `chrome.alarms` instead.
  - So a 20–40 s `setTimeout` with nothing else happening can pass 30 s idle. The worker is then stopped and the callback never runs.
  - The `runtime.onMessage` from a content script and `tabs.*` events are events, so each one resets the timer. The gap after `tabs.remove` is the risky part.
- **Keepalive pings (verified, migrate page).** Calling a trivial extension API now and then keeps the timer reset. The page treats this as an exception and says that "there is usually a better, platform idiomatic, way". It also says continuous keepalive is only allowed for enterprise and education use.
- **Recommended pattern (verified pieces, put together here).**
  - Keep the job state in storage, because "any global variables you set will be lost if the service worker shuts down" (lifecycle).
  - Schedule each next step with `chrome.alarms.create({ delayInMinutes: 0.5 })`, or longer.
  - On every worker start, read the state back and continue from it.
- **`chrome.storage.session` (verified, [storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)).**
  - Kept in memory, 10 MB.
  - "Cleared if the extension is disabled, reloaded, updated, and when the browser restarts". Fine for one run, because each run is one Chrome launch.
  - Content scripts can't see it unless you call `setAccessLevel()`.
  - Use `storage.local` (10 MB) for anything that must survive a crash or a relaunch.
- **Offscreen documents (verified, [offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen)).** Only `chrome.runtime` works inside them, and an extension can have only one open at a time. Messages from one reset the worker's timers (Chrome 109). They are not needed for this flow.

## 2. chrome.alarms

Source: [chrome.alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms).

- **Permission (verified).** Needs the `"alarms"` permission.
- **Minimum delay (verified).** "Chrome limits alarms to at most once every 30 seconds but may delay them an arbitrary amount more." A `delayInMinutes` or `periodInMinutes` below `0.5` "will not be honored and will cause a warning". The 30 s minimum arrived in Chrome 120 (lifecycle page).
- **Sleep (verified).** Alarms keep running while the device sleeps but don't wake it. A missed alarm fires on wake.
- **Restarts (verified).** `persistAcrossSessions` defaults to `true` in Chrome, and such an alarm "persists until the extension updates". With `false`, the alarm is cleared on browser restart. The docs say to check that important alarms exist each time the worker starts.
- **Restart plus our run state (unverified).** No source says what happens when a leftover alarm from a crashed run fires in the next launch. Clear stale alarms when a run starts.

## 3. chrome.runtime.onStartup

Source: [chrome.runtime](https://developer.chrome.com/docs/extensions/reference/api/runtime), lifecycle page.

- **When it fires (verified).** "Fired when a profile that has this extension installed first starts up." It does not fire when an incognito profile starts. The lifecycle page adds: "When a user profile starts, the `runtime.onStartup` event fires but no service worker events are invoked."
- **Custom `--user-data-dir` (unverified, but likely).** No doc mentions `--user-data-dir`. A custom data dir still holds a normal profile (`Default/`) that starts on launch, so the event should fire.
- **Hand runs (unverified).** If Chrome is already running on that dir when the script runs, the profile is not starting again, so `onStartup` won't fire (see §6). Have the script start the run some other way as well, or check for this.

## 4. tabs.create / tabs.remove and background tabs

Sources: [chrome.tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs), [content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [timer throttling (Chrome 88)](https://developer.chrome.com/blog/timer-throttling-in-chrome-88), [Freezing on Energy Saver](https://developer.chrome.com/blog/freezing-on-energy-saver).

- **Permissions (verified).** "Most features don't require any permissions to use", and creating a tab is the example given. The `"tabs"` permission only unlocks four `Tab` fields: `url`, `pendingUrl`, `title` and `favIconUrl`. It "does not give access to the `chrome.tabs` namespace."
  - `tabs.remove` is not named on that page. Under the "most features" rule it needs no permission (unverified that it is explicit).
- **`sender.tab.id` (verified).** `MessageSender.tab` is present when the message came from a tab, including content scripts. `id` is not one of the four protected fields, so you don't need `"tabs"` to read it. You need `"tabs"` or host permissions to read `sender.tab.url`.
- **`active: false` (verified).** "Whether the tab should become the active tab in the window", default `true`, "does not affect whether the window is focused".
- **`document_idle` timing (verified).** The script is injected at a time the browser picks, between `document_end` and just after `window.onload`. Static content scripts need `matches` patterns.
- **Background tabs (unverified).** No primary doc says a hidden tab loads and runs `document_idle` scripts exactly as a visible tab does. That is the expected behavior, but test it.
- **Timer throttling in hidden pages (verified, Chrome 88 post).**
  - Hidden pages check timers once per second.
  - "Intensive" throttling checks them once per minute. It applies only when all of these hold: hidden for more than 5 minutes, chain count of 5 or more, silent for at least 30 s, and no WebRTC.
  - Our tabs live well under 5 minutes, so only the 1 s batching can apply. A content script that polls the DOM with `setTimeout` may run up to about 1 s late.
- **Freezing (verified).** From Chrome 133, Energy Saver freezes some CPU-heavy tabs. It applies only to pages hidden and silent for more than 5 minutes, so it doesn't affect us.

## 5. `--load-extension`, unpacked persistence, extension ID

- **`--load-extension` removed (verified).** It is ignored in official Chrome-branded builds from Chrome 137. Chromium and Chrome for Testing still support it. The suggested alternative is chrome://extensions → Developer mode → Load unpacked. Source: [PSA: Removing `--load-extension` flag in Chrome branded builds](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/1-g8EFx2BBY/m/S0ET5wPjCAAJ), chromium-extensions group, April 2025.
- **`--disable-features=DisableLoadExtensionCommandLineSwitch` (unverified).** Third parties used this as a temporary bypass, but no primary source confirms it or says how long it lasts. Don't rely on it.
- **Unpacked persists across restarts (verified, Chromium source [`installed_loader.cc`](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/extensions/installed_loader.cc)).**
  - At startup, `InstalledLoader::LoadAllExtensions` loads every extension recorded in the profile's prefs.
  - For unpacked extensions it says: "Always reload manifests of unpacked extensions, because they can change on disk". So edits on disk are picked up on the next launch.
  - Command-line extensions are skipped: "we don't want those to persist across browser restart."
  - Loading the extension once by hand in the capture profile is enough.
- **ID from path (verified, Chromium source).**
  - [`extension.cc`](https://chromium.googlesource.com/chromium/src/+/main/extensions/common/extension.cc) `ComputeExtensionID` falls back to `crx_file::id_util::GenerateIdForPath(path)` when there is no `key`. The comment there says this "keeps the ID stable across restarts and reloading the extension."
  - [`id_util.cc`](https://chromium.googlesource.com/chromium/src/+/main/components/crx_file/id_util.cc) hashes the path bytes with SHA-256, takes the first 16 bytes, and maps each hex digit to `a`–`p`, giving a 32-character ID. It changes only the drive letter case on Windows and leaves macOS paths as they are.
  - Result: the same folder path gives the same ID in any profile. Moving or renaming the folder changes the ID.
  - A manifest `"key"` pins the ID instead ([manifest key](https://developer.chrome.com/docs/extensions/reference/manifest/key)).
- **Paths that point to the same folder (unverified).** It is not confirmed whether Chrome resolves symlinks or `..` before hashing. Always load from the same real, absolute path.

## 6. Launching and quitting Chrome on macOS

- **One process per user-data-dir (verified, [`process_singleton.h`](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/process_singleton.h)).** The singleton "is named according to the user data directory, so we can be sure that no more than one copy of the application can be running at once with a given data directory." A different `--user-data-dir` therefore starts a separate browser alongside your normal Chrome.
- **Second launch on the same dir (verified, [`process_singleton_posix.cc`](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/process_singleton_posix.cc), which also covers macOS).**
  - The second process finds `SingletonSocket` in the profile dir, sends its current directory and command line to the running browser, waits for an ACK, and exits. The running browser handles the URLs.
  - If no ACK arrives in time, it treats the first process as hung. It reads the PID from `SingletonLock -> <hostname>-<pid>`, sends SIGKILL, and starts normally.
  - The script should check for a running instance first rather than launch twice.
- **`open -na` versus the binary (verified flags, `man open`).**
  - `-n` opens "a new instance of the application(s) even if one is already running". `--args` passes the remaining arguments to `main()`. `-g` doesn't bring the app to the front. `-W` waits until the app exits.
  - Without `-n`, while Chrome is already running, the `--args` most likely never reach a new process (unverified; `man open` doesn't say).
  - Running the binary directly (`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --user-data-dir=…`) is the form Chromium documents ([Run Chromium with flags](https://www.chromium.org/developers/how-tos/run-chromium-with-flags/)). The process is then a child of the script, so it shares the LaunchAgent's process group and is killed when the job exits (see §7). `open -n` hands the launch to LaunchServices instead.
- **SIGTERM is a clean exit on macOS (verified, [`chrome_browser_main_posix.cc`](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/chrome_browser_main_posix.cc), [`application_lifetime_desktop.cc`](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/lifetime/application_lifetime_desktop.cc), [`browser_process_impl.cc`](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/browser_process_impl.cc)).**
  - On Linux and macOS, SIGTERM calls `chrome::SessionEnding()`. The comment notes that launchd sends SIGTERM at logout, shutdown and update.
  - `SessionEnding()` is a "time-limited shutdown". It calls `EndSession()`, which commits profile prefs and Local State, logs a clean shutdown, and marks the exit type `kForcedShutdown`. It then exits with code 0 without running unload handlers.
  - SIGINT and SIGHUP call `chrome::AttemptExit()`, the normal quit.
  - Whether `kForcedShutdown` shows a "Restore pages?" bubble on next launch is unverified. Either way it is harmless for this profile.
  - Send the signal only to the main browser PID. Read it from `<user-data-dir>/SingletonLock`, or use `pgrep -f` anchored on `Contents/MacOS/Google Chrome --user-data-dir=<dir>`. Helper processes also exist, and whether they carry `--user-data-dir` is unverified.
  - `osascript 'tell application "Google Chrome" to quit'` targets the app by name and could quit your normal Chrome. Unverified which instance it hits, so avoid it.
- **Flags (verified, [`chrome_switches.h`](https://chromium.googlesource.com/chromium/src/+/main/chrome/common/chrome_switches.h)).**
  - `--no-first-run`: "Skip First Run tasks as well as not showing additional dialogs, prompts or bubbles." It is meant for automation, and it doesn't drop the First Run sentinel.
  - `--no-default-browser-check`: "Disables the default browser check."
  - Other options: `--no-startup-window`, which opens no window and is meant for hosting background apps. Whether an extension can then open tabs is unverified.
- **No warning bar for these flags (verified, [`bad_flags_prompt.cc`](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/ui/startup/bad_flags_prompt.cc)).** `user-data-dir`, `no-first-run`, `no-default-browser-check` and `load-extension` are not in `kBadFlags`, the list that triggers the "unsupported command-line flag" bar. A bad user-data-dir instead shows a separate dialog (`MaybeShowInvalidUserDataDirWarningDialog`).
- **Default data dir on Mac (verified, [user_data_dir.md](https://chromium.googlesource.com/chromium/src/+/main/docs/user_data_dir.md)).** `~/Library/Application Support/Google/Chrome`. The doc also says "two running Chrome instances cannot share the same user data directory."

## 7. User LaunchAgent (`~/Library/LaunchAgents`)

Sources: `man launchd.plist`, `man launchctl` (local, macOS 26.3), [TN2083 Daemons and Agents](https://developer.apple.com/library/archive/technotes/tn2083/_index.html), [Creating Launch Daemons and Agents](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html).

- **`StartInterval` (verified, man).** Starts the job every N seconds. "If the system is asleep during the time of the next scheduled interval firing, that interval will be missed." "If the job is running during an interval firing, that interval firing will likewise be missed." So runs never overlap: launchd skips the start and doesn't kill the running job.
- **`StartCalendarInterval` (verified, man).** Uses cron-like fields (`Minute`, `Hour`, `Day`, `Weekday`, `Month`). "Unlike cron … launchd will start the job the next time the computer wakes up. If multiple intervals transpire before the computer is woken, those events will be coalesced into one event upon wake." For example, `Hour` 0,3,6,…,21 as an array of dicts gives a catch-up run after sleep.
  - Whether a calendar firing during a run is skipped is not stated in the man page. It is probably skipped, because a label has one instance (unverified).
- **`RunAtLoad` (verified, man).** Runs the job once when it is loaded. Default is false. The man page says to avoid it because it slows boot and login.
- **`StandardOutPath` / `StandardErrorPath` (verified, man).** stdout and stderr go to these files, which are created if missing. Use absolute paths, because `~` is not expanded (unverified; plist strings are literal).
- **`ProgramArguments` / `Program` (verified, man).** `Program` must be an absolute path. Without it, `ProgramArguments[0]` may be relative, and launchd resolves it using `_PATH_STDPATH`.
  - `_PATH_STDPATH` is `/usr/bin:/bin:/usr/sbin:/sbin` (verified, SDK `paths.h`).
  - The PATH a job actually gets is unverified, but it is not your shell PATH. Set `PATH` in `EnvironmentVariables`, or use absolute paths for `node`, `pnpm`, `jq` and so on.
- **`EnvironmentVariables` (verified, man).** A dictionary of strings. Non-string values are ignored.
- **`LimitLoadToSessionType` (verified, man and TN2083).** Applies only to agents. TN2083 lists the values:
  - `Aqua`: "has access to all GUI services; much like a login item".
  - `Background`, `LoginWindow` and `StandardIO`.
  - "If you don't specify … launchd assumes a value of `Aqua`."
  - Daemons "cannot display any GUI". So a user agent can launch Chrome. Setting `Aqua` explicitly is harmless.
- **`AbandonProcessGroup` (verified, man).** "When a job dies, launchd kills any remaining processes with the same process group ID as the job." Setting it to true turns this off. It matters if the script starts the Chrome binary directly and exits before Chrome has quit.
- **`ProcessType` (verified, man).** If unset, the system applies "light resource limits … throttling its CPU usage and I/O bandwidth". `Interactive` removes them. Whether a Chrome started with `open` inherits these limits is unverified; it probably doesn't, since LaunchServices starts it.
- **`ExitTimeOut` (verified, man).** The time between SIGTERM and SIGKILL "when the job is to be stopped"; the default is "system-defined". It applies only when launchd stops the job, for example on `bootout`, logout or `kickstart -k`. It is not a runtime limit. The old `TimeOut` key "is no longer implemented", so a ~30-minute run is fine.
- **Don't exit too fast or daemonize (verified, Creating Launch Daemons).** "do not shut down for at least 10 seconds after launch". Never fork and exit the parent.
- **`launchctl` (verified, man).**
  - `bootstrap gui/$(id -u) ~/Library/LaunchAgents/<label>.plist` loads the job. `bootout gui/$(id -u)/<label>` (or the same plist path) removes it. Both replace the legacy `load` and `unload`.
  - `kickstart [-kp] gui/$(id -u)/<label>` runs the job now. `-k` kills a running instance first, and `-p` prints the PID.
  - `print gui/$(id -u)/<label>` shows state and last exit status. Its output "is NOT API".
  - `enable` and `disable` persist across boots.
  - A plist in `$HOME/Library/LaunchAgents` must be owned by the user and must not be group- or world-writable.
- **`plutil -lint <plist>`** checks plist syntax. This is standard; it was not checked against the man page here.
- **"Background Items Added" (partly verified).** Apple's [deployment guide](https://support.apple.com/guide/deployment/manage-login-items-background-tasks-mac-depdca572563/web) says macOS 13+ tells users when login and background items are added. They are listed in System Settings → General → Login Items, and `sfltool dumpbtm` prints them. Whether a hand-installed `~/Library/LaunchAgents` plist triggers the notification is unverified (third-party reports say yes). It is a notice, not a block, but the user can turn the item off there.
