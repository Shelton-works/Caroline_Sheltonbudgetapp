#!/usr/bin/env bash
# -------------------------------------------------------------------
# Deploy backend to Render via deploy hook
#
# Usage:
#   1. Get your deploy hook URL from Render Dashboard:
#      Service → Settings → Deploy Hooks → Create Deploy Hook
#
#   2. Run this script:
#      ./backend/deploy.sh <your-deploy-hook-url>
#
#   3. Or set it as an env var:
#      export RENDER_DEPLOY_HOOK_URL="https://api.render.com/deploy/srv-xxx?key=yyy"
#      ./backend/deploy.sh
# -------------------------------------------------------------------
set -euo pipefail

HOOK_URL="${1:-${RENDER_DEPLOY_HOOK_URL:-}}"

if [ -z "$HOOK_URL" ]; then
  echo "❌ No deploy hook URL provided."
  echo ""
  echo "Usage:"
  echo "  ./backend/deploy.sh https://api.render.com/deploy/srv-xxx?key=yyy"
  echo ""
  echo "Or set RENDER_DEPLOY_HOOK_URL environment variable."
  echo ""
  echo "Get your hook URL from: Render Dashboard → your-service → Settings → Deploy Hooks"
  exit 1
fi

echo "🚀 Triggering Render deploy..."
echo "   URL: ${HOOK_URL%%\?key=*}?key=***"

RESPONSE=$(curl -s -X POST "$HOOK_URL")
DEPLOY_ID=$(echo "$RESPONSE" | grep -o '"deployId"[^"]*"[^"]*"' | grep -o '[^"]*$' | head -1)

if [ -n "$DEPLOY_ID" ]; then
  echo "✅ Deploy triggered! ID: $DEPLOY_ID"
  echo ""
  echo "Track progress at:"
  echo "   https://dashboard.render.com/web/srv-d936rg4m0tmc73d2iql0/deploys/$DEPLOY_ID"
  echo ""
else
else
  echo "⚠️  Response: $RESPONSE"
  echo ""
  echo "Check the Render dashboard for deploy status."
fi
