#!/usr/bin/env bash
# Prompts for CONVEX_SERVER_SECRET and sets it everywhere it must match:
#   local: .env.local + Convex dev
#   prod:  Convex prod + Vercel (Production, Preview)
# The value is never echoed or passed as a command-line argument.
set -euo pipefail

NAME="CONVEX_SERVER_SECRET"
MIN_LENGTH=16
ENV_FILE=".env.local"

cd "$(dirname "$0")/.."

read -rsp "$NAME (leave blank to generate one): " secret
echo
if [[ -z "$secret" ]]; then
	secret="$(openssl rand -hex 32)"
	echo "Generated a 64-character secret."
elif ((${#secret} < MIN_LENGTH)); then
	echo "Secret must be at least $MIN_LENGTH characters." >&2
	exit 1
fi

function confirm() {
	local reply
	read -rp "$1 " reply
	[[ "$reply" =~ ^[Yy] ]]
}

if confirm "Set for local dev ($ENV_FILE + Convex dev)? [y/N]"; then
	touch "$ENV_FILE"
	tmp="$(mktemp)"
	grep -v "^$NAME=" "$ENV_FILE" >"$tmp" || true
	printf '%s=%s\n' "$NAME" "$secret" >>"$tmp"
	mv "$tmp" "$ENV_FILE"
	echo "✓ $ENV_FILE"

	printf '%s' "$secret" | npx convex env set "$NAME"
	echo "✓ Convex dev"
fi

if confirm "Set for production (Convex prod + Vercel Production & Preview)? [y/N]"; then
	printf '%s' "$secret" | npx convex env set "$NAME" --prod
	echo "✓ Convex prod"

	for target in production preview; do
		printf '%s' "$secret" | vercel env add "$NAME" "$target" --sensitive --force --yes
		echo "✓ Vercel $target"
	done
fi

echo "Done."
