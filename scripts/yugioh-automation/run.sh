#!/bin/bash
# One automated capture run for the Yu-Gi-Oh tracker (docs/yugioh/automation.md).
#
# Asks the app for a run, opens the automation Chrome profile (its extension
# claims the run and visits its pages), waits for the run to end, then quits
# that Chrome if this script opened it. The LaunchAgent asks every 10 minutes;
# the app answers with a full run about every 3 hours (never 1–7 AM), a refresh
# run before a matched auction ends, or nothing due. A scheduled run waits a
# moment the app picks (up to 4 minutes, 90 s for a refresh run) before it
# opens Chrome. T3 Code and hand runs are always full runs, and don't wait.
# For 6 hours after a run stops on a check page (a captcha), the LaunchAgent's
# asks get nothing; T3 Code and hand runs still start:
#
#   scripts/yugioh-automation/run.sh [--trigger launchAgent|t3|manual]
#
# Settings come from ~/.config/yugioh-automation/config (see install.sh).
# Exit codes: 0 the run finished (or one was already going, or none was due),
# 1 it failed, 2 it stopped on a check page, 64 bad arguments, 78 not set up.

set -uo pipefail

# Overridable for trying the script out; the defaults suit real runs.
PICKUP_TIMEOUT_S="${YUGIOH_PICKUP_TIMEOUT_S:-180}" # the extension checks every minute
RUN_TIMEOUT_S="${YUGIOH_RUN_TIMEOUT_S:-10800}"     # the app abandons open runs after 3½ hours
POLL_S="${YUGIOH_POLL_S:-20}"

minutes() {
	local m=$(($1 / 60))
	if [ "$m" -eq 1 ]; then echo "1 minute"; else echo "$m minutes"; fi
}

# Sleeps in the background, so a stop signal is handled at once rather than
# when the sleep ends (bash defers traps until a foreground command returns).
pause() {
	sleep "$1" &
	wait $!
}

# A JSON string: the text quoted, with backslashes and quotes escaped.
json_string() {
	printf '"%s"' "$(printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')"
}

log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

trigger="manual"
while [ $# -gt 0 ]; do
	case "$1" in
	--trigger) trigger="${2:-}"; shift 2 ;;
	--trigger=*) trigger="${1#*=}"; shift ;;
	-h | --help) sed -n '2,18p' "$0"; exit 0 ;;
	*) echo "Unknown argument: $1" >&2; exit 64 ;;
	esac
done
case "$trigger" in
launchAgent | t3 | manual) ;;
*) echo "--trigger must be launchAgent, t3 or manual" >&2; exit 64 ;;
esac

config="${YUGIOH_AUTOMATION_CONFIG:-$HOME/.config/yugioh-automation/config}"
if [ ! -f "$config" ]; then
	log "No config at $config. Run scripts/yugioh-automation/install.sh first."
	exit 78
fi
# shellcheck source=/dev/null
. "$config"
if [ -z "${YUGIOH_INGEST_SECRET:-}" ]; then
	log "Set YUGIOH_INGEST_SECRET in $config (the app's RYM_EXTENSION_INGEST_SECRET)."
	exit 78
fi
origin="${YUGIOH_APP_ORIGIN:-https://www.moooose.dev}"
origin="${origin%/}"
profile="${YUGIOH_CHROME_PROFILE:-$HOME/Library/Application Support/yugioh-automation/chrome-profile}"
chrome_app="${YUGIOH_CHROME_APP:-/Applications/Google Chrome.app}"

# One step of the run: POST {"op": …} to the app. The secret goes in through a
# file descriptor, so it never shows in `ps`.
step() {
	curl --silent --show-error --fail-with-body --max-time 30 \
		-X POST "$origin/api/yugioh/automation" \
		-H @<(printf 'Authorization: Bearer %s\n' "$YUGIOH_INGEST_SECRET") \
		-H 'Content-Type: application/json' \
		--data "$1"
}

# A field of a JSON reply (string, number or boolean), or nothing.
field() { plutil -extract "$2" raw -o - - <<<"$1" 2>/dev/null; }

# "eBay" or "TCGplayer" for the app's marketplace name.
marketplace_name() {
	case "$1" in
	ebay) echo "eBay" ;;
	tcgplayer) echo "TCGplayer" ;;
	*) echo "$1" ;;
	esac
}

# The clock time of a Unix ms timestamp, like 21:40.
clock() { date -r "$(($1 / 1000))" '+%H:%M'; }

# The PID of the Chrome running this profile, from its SingletonLock
# (a symlink to "<host>-<pid>"), or nothing.
chrome_pid() {
	local lock pid
	lock="$(readlink "$profile/SingletonLock" 2>/dev/null)" || return 0
	pid="${lock##*-}"
	if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then echo "$pid"; fi
}

run_id=""
ended=false
launched=false

finish() {
	if [ -n "$run_id" ] && [ "$ended" = false ]; then
		step "{\"op\":\"finish\",\"runId\":\"$run_id\",\"error\":$(json_string "$1")}" >/dev/null ||
			log "Couldn't tell the app the run ended."
		ended=true
	fi
}

quit_chrome() {
	[ "$launched" = true ] || return 0
	local pid waited=0
	pid="$(chrome_pid)"
	[ -n "$pid" ] || return 0
	log "Quitting the automation Chrome (pid $pid)."
	kill -TERM "$pid" 2>/dev/null
	while kill -0 "$pid" 2>/dev/null && [ "$waited" -lt 30 ]; do
		sleep 1
		waited=$((waited + 1))
	done
}

on_signal() {
	log "Stopped."
	finish "The script was stopped."
	quit_chrome
	exit 1
}
trap on_signal INT TERM

reply="$(step "{\"op\":\"request\",\"trigger\":\"$trigger\"}")" || {
	log "Couldn't ask $origin for a run: ${reply:0:200}"
	exit 1
}
run_id="$(field "$reply" runId)"
kind="$(field "$reply" kind)"
if [ -z "$run_id" ]; then
	# A scheduled ask with nothing due (runId null): the usual answer every 10
	# minutes, so it isn't logged.
	if [ "$(field "$reply" alreadyOpen)" = "false" ]; then exit 0; fi
	log "Unexpected reply from the app: ${reply:0:200}"
	exit 1
fi
if [ "$(field "$reply" alreadyOpen)" = "true" ]; then
	log "A run is already going ($run_id). Leaving it be."
	ended=true
	exit 0
fi
log "Asked for run $run_id ($trigger, ${kind:-full})."
check_page="$(field "$reply" lastCheckPage.marketplace)"
if [ -n "$check_page" ]; then
	log "The last run stopped on a check page at $(marketplace_name "$check_page")" \
		"at $(clock "$(field "$reply" lastCheckPage.at)"). Scheduled runs wait until" \
		"$(clock "$(field "$reply" lastCheckPage.coolDownEndsAt)"); this one runs anyway."
fi

# A scheduled run starts a moment after the ask, so runs don't start on the
# 10-minute marks. The extension claims it once Chrome opens (at once, if
# the profile is already open).
start_delay_ms="$(field "$reply" startDelayMs)"
start_delay_s=$((${start_delay_ms:-0} / 1000))
if [ "$start_delay_s" -gt 0 ]; then
	log "Starting in ${start_delay_s}s."
	pause "$start_delay_s"
fi

if [ -z "$(chrome_pid)" ]; then
	mkdir -p "$profile"
	if ! open -n -g -a "$chrome_app" --args \
		--user-data-dir="$profile" --no-first-run --no-default-browser-check; then
		log "Couldn't open $chrome_app."
		finish "Couldn't open Chrome."
		exit 1
	fi
	launched=true
	log "Opened the automation Chrome profile."
else
	log "The automation Chrome profile is already open; its extension checks every minute."
fi

started_at="$(date +%s)"
status="requested"
while :; do
	pause "$POLL_S"
	elapsed=$(($(date +%s) - started_at))
	if reply="$(step "{\"op\":\"status\",\"runId\":\"$run_id\"}")"; then
		status="$(field "$reply" run.status)"
	else
		log "Couldn't check on the run: ${reply:0:200}"
	fi
	case "$status" in
	finished | failed | challenged)
		ended=true
		break
		;;
	requested)
		if [ "$elapsed" -ge "$PICKUP_TIMEOUT_S" ]; then
			finish "The extension didn't start the run within $(minutes "$PICKUP_TIMEOUT_S"). Is Run automated captures on in its options?"
			status="failed"
			break
		fi
		;;
	esac
	if [ "$elapsed" -ge "$RUN_TIMEOUT_S" ]; then
		finish "Timed out after $(minutes "$RUN_TIMEOUT_S")."
		status="failed"
		break
	fi
done

quit_chrome

if reply="$(step "{\"op\":\"status\",\"runId\":\"$run_id\"}")"; then
	log "Run $run_id $(field "$reply" run.status):" \
		"$(field "$reply" run.pagesVisited) of $(field "$reply" run.pagesPlanned) pages," \
		"$(field "$reply" run.listingsCaptured) Listings captured ($(field "$reply" run.newListings) new)," \
		"$(field "$reply" run.failedPages) pages failed."
	error="$(field "$reply" run.error)"
	if [ "$status" = "challenged" ]; then
		log "Stopped on a check page at" \
			"$(marketplace_name "$(field "$reply" run.checkPage.marketplace)")" \
			"($(field "$reply" run.checkPage.label)): $(field "$reply" run.checkPage.url)"
		log "Open the automation profile (scripts/yugioh-automation/open-profile.sh)" \
			"and solve it. Scheduled runs wait 6 hours; a hand run can go sooner."
	elif [ -n "$error" ]; then
		log "Error: $error"
	fi
fi
case "$status" in
finished) exit 0 ;;
challenged) exit 2 ;;
*) exit 1 ;;
esac
