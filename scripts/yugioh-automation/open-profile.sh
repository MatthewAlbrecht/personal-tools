#!/bin/bash
# Opens the automation Chrome profile by hand, for the one-time setup (load
# the extension, set its options) or to watch it (docs/yugioh/automation.md).

set -euo pipefail

config="${YUGIOH_AUTOMATION_CONFIG:-$HOME/.config/yugioh-automation/config}"
# shellcheck source=/dev/null
[ -f "$config" ] && . "$config"
profile="${YUGIOH_CHROME_PROFILE:-$HOME/Library/Application Support/yugioh-automation/chrome-profile}"

mkdir -p "$profile"
open -n -a "${YUGIOH_CHROME_APP:-/Applications/Google Chrome.app}" --args \
	--user-data-dir="$profile" --no-first-run --no-default-browser-check
echo "Opened Chrome with $profile"
