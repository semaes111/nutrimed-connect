#!/bin/sh
set -e

ENV_FILE=/usr/share/nginx/html/env-config.js
if [ -f "$ENV_FILE" ]; then
  sed -i "s|__VITE_SUPABASE_URL__|${VITE_SUPABASE_URL:-}|g" "$ENV_FILE"
  sed -i "s|__VITE_SUPABASE_ANON_KEY__|${VITE_SUPABASE_ANON_KEY:-}|g" "$ENV_FILE"
fi

exec "$@"
