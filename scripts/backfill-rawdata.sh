#!/bin/bash

# Backfill rawData on all canonical tracks via API route
# This avoids Convex byte limits by running in Next.js

API_URL="${1:-http://localhost:1333}/api/backfill-rawdata"
CONTINUE_FROM=""

echo "🚀 Backfill rawData via API: $API_URL"
echo ""

while true; do
  echo "🔄 Running backfill..."
  
  if [ -z "$CONTINUE_FROM" ]; then
    RESULT=$(curl -s -X POST "$API_URL" \
      -H "Content-Type: application/json" \
      -d '{"maxIterations": 200}')
  else
    RESULT=$(curl -s -X POST "$API_URL" \
      -H "Content-Type: application/json" \
      -d "{\"continueFrom\": $CONTINUE_FROM, \"maxIterations\": 200}")
  fi
  
  echo "$RESULT" | jq .
  
  # Check if done
  if echo "$RESULT" | grep -q '"done":true'; then
    echo "✅ All done!"
    break
  fi
  
  # Check for errors
  if echo "$RESULT" | grep -q '"error"'; then
    echo "❌ Error occurred. Exiting."
    exit 1
  fi
  
  # Extract continueFrom value
  CONTINUE_FROM=$(echo "$RESULT" | jq -r '.continueFrom // empty')
  
  if [ -z "$CONTINUE_FROM" ] || [ "$CONTINUE_FROM" = "null" ]; then
    echo "⚠️ Could not find continueFrom value. Exiting."
    exit 1
  fi
  
  echo "📍 Continuing from: $CONTINUE_FROM"
  echo ""
  sleep 1
done
