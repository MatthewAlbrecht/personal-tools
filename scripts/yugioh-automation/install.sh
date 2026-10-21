#!/bin/bash
# Installs the LaunchAgent that runs run.sh every 10 minutes
# (docs/yugioh/automation.md). Safe to run again: it reloads the agent.
#
#   scripts/yugioh-automation/install.sh            install (or reinstall)
#   scripts/yugioh-automation/install.sh --dry-run  print the plist only
#
# Creates ~/.config/yugioh-automation/config (mode 600) when missing. Fill in
# YUGIOH_INGEST_SECRET there before the first run.

set -euo pipefail

label="dev.moooose.yugioh-automation"
here="$(cd "$(dirname "$0")" && pwd)"
run_script="$here/run.sh"
template="$here/$label.plist.template"
plist="$HOME/Library/LaunchAgents/$label.plist"
log_file="$HOME/Library/Logs/yugioh-automation/run.log"
config="$HOME/.config/yugioh-automation/config"

case "$run_script$log_file" in
*'|'* | *'&'*)
	echo "Move the repo to a path without | or & first: $run_script" >&2
	exit 1
	;;
esac

render() {
	sed -e "s|__RUN_SCRIPT__|$run_script|g" -e "s|__LOG_FILE__|$log_file|g" "$template"
}

if [ "${1:-}" = "--dry-run" ]; then
	render
	exit 0
fi

if [ ! -f "$config" ]; then
	mkdir -p "$(dirname "$config")"
	(umask 077 && cat >"$config") <<'CONFIG'
# Yu-Gi-Oh tracker automated captures (docs/yugioh/automation.md).
# The app's RYM_EXTENSION_INGEST_SECRET (the same secret as the extension's options).
YUGIOH_INGEST_SECRET=""
# Where the app runs. Must match the extension's "App origin".
YUGIOH_APP_ORIGIN="https://www.moooose.dev"
# The dedicated Chrome profile with the extension loaded.
YUGIOH_CHROME_PROFILE="$HOME/Library/Application Support/yugioh-automation/chrome-profile"
CONFIG
	chmod 600 "$config"
	echo "Created $config. Set YUGIOH_INGEST_SECRET in it."
fi

chmod +x "$run_script"
mkdir -p "$(dirname "$plist")" "$(dirname "$log_file")"
render >"$plist"
chmod 644 "$plist"
plutil -lint "$plist"

domain="gui/$(id -u)"
launchctl bootout "$domain/$label" 2>/dev/null || true
# bootout returns before the old job is fully gone; bootstrap can fail with
# "Bootstrap failed: 5" until it is, so try a few times.
for attempt in 1 2 3 4 5; do
	if launchctl bootstrap "$domain" "$plist" 2>/dev/null; then break; fi
	if [ "$attempt" -eq 5 ]; then launchctl bootstrap "$domain" "$plist"; fi
	sleep 1
done
echo "Installed $label: asks the app every 10 minutes (a full run every 3 hours, refresh runs before auctions end). Logs: $log_file"
echo "Run it now with: launchctl kickstart -p $domain/$label"
