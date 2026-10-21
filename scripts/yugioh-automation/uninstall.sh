#!/bin/bash
# Removes the LaunchAgent installed by install.sh. Leaves the config, the
# logs and the Chrome profile; their paths are printed for removing by hand.

set -euo pipefail

label="dev.moooose.yugioh-automation"
plist="$HOME/Library/LaunchAgents/$label.plist"

launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
rm -f "$plist"
echo "Removed $label."
echo "Kept (delete by hand if you want them gone):"
echo "  $HOME/.config/yugioh-automation/config"
echo "  $HOME/Library/Logs/yugioh-automation/"
echo "  $HOME/Library/Application Support/yugioh-automation/chrome-profile/"
