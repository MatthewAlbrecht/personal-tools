#!/bin/bash

# Clear all legacy rawData/trackData from all tables

PROD_FLAG=""
if [ "$1" = "--prod" ]; then
  PROD_FLAG="--prod"
  echo "🚀 Clearing all legacy raw data on PRODUCTION"
else
  echo "🚀 Clearing all legacy raw data on LOCAL"
fi

run_clear() {
  local NAME=$1
  local MUTATION=$2
  
  echo ""
  echo "=== Clearing $NAME ==="
  TOTAL=0
  while true; do
    RESULT=$(pnpm exec convex run $PROD_FLAG "$MUTATION" '{"batchSize": 500}' 2>&1)
    CLEARED=$(echo "$RESULT" | grep -o '"cleared": [0-9]*' | grep -o '[0-9]*')
    DONE=$(echo "$RESULT" | grep -o '"done": [a-z]*' | grep -o 'true\|false')
    
    if [ -n "$CLEARED" ]; then
      TOTAL=$((TOTAL + CLEARED))
      echo "  Processed $CLEARED (total: $TOTAL)"
    fi
    
    if [ "$DONE" = "true" ]; then
      echo "✅ $NAME done! Total: $TOTAL"
      break
    fi
    
    # Check for errors
    if echo "$RESULT" | grep -q "Error"; then
      echo "❌ Error in $NAME:"
      echo "$RESULT"
      break
    fi
  done
}

run_clear "spotifyTracksCanonical (rawData)" "spotify:clearLegacyRawData"
run_clear "spotifyArtists (rawData)" "spotify:clearLegacyArtistRawData"
run_clear "spotifyTracks (trackData)" "spotify:clearLegacyTracksTrackData"
run_clear "spotifyAlbums (rawData)" "spotify:clearLegacyAlbumRawData"
run_clear "spotifySongCategorizations (trackData)" "spotify:clearLegacyCategorizationTrackData"

echo ""
echo "🎉 All legacy raw data cleared!"
