#!/usr/bin/env bash
# Deploy de la migración MiMo → DeepSeek + Gemini (nm-chat v17.1 + nm-scanner v3.0)
# Requiere: export SUPABASE_ACCESS_TOKEN=sbp_...  (se genera en
# https://supabase.com/dashboard/account/tokens)
set -euo pipefail
REF="bpazmmbjjducdmxgfoum"
: "${SUPABASE_ACCESS_TOKEN:?Falta SUPABASE_ACCESS_TOKEN (sbp_...)}"
: "${DEEPSEEK_API_KEY:?Falta DEEPSEEK_API_KEY}"
: "${GEMINI_API_KEY:?Falta GEMINI_API_KEY}"

echo "── 1/3 Secrets ──"
npx -y supabase@latest secrets set \
  "DEEPSEEK_API_KEY=$DEEPSEEK_API_KEY" \
  "GEMINI_API_KEY=$GEMINI_API_KEY" \
  --project-ref "$REF"

echo "── 2/3 Deploy nm-chat ──"
npx -y supabase@latest functions deploy nm-chat --project-ref "$REF" --no-verify-jwt

echo "── 3/3 Deploy nm-scanner ──"
npx -y supabase@latest functions deploy nm-scanner --project-ref "$REF" --no-verify-jwt

echo "✔ Deploy completado. Verificar con los curls de smoke test."
