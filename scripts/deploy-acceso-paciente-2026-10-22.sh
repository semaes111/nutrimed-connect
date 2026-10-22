#!/usr/bin/env bash
# Despliegue «acceso del paciente por código» (2026-10-22)
#   F2  migración 004  nm_app_registrar_peso                 (BD, aditiva)
#   F3  nm-chat v17.2 · nm-scanner v3.1 · nm-shopping v8.1  (EF, modo soft: compatibles con el bundle antiguo)
#   F4  tras publicar el frontend en Dokploy:
#         secret NM_REQUIRE_ACCESS_CODE=true  +  migración 005 (cierre de lecturas anónimas)
#
# Requiere: export SUPABASE_ACCESS_TOKEN=sbp_...  (https://supabase.com/dashboard/account/tokens)
# Uso:      bash scripts/deploy-acceso-paciente-2026-10-22.sh fase1   # F2 + F3 (antes del frontend)
#           bash scripts/deploy-acceso-paciente-2026-10-22.sh fase2   # F4     (después del frontend)
set -euo pipefail
REF="bpazmmbjjducdmxgfoum"
API="https://api.supabase.com/v1/projects/$REF"
: "${SUPABASE_ACCESS_TOKEN:?Falta SUPABASE_ACCESS_TOKEN (sbp_...)}"
FASE="${1:-fase1}"
cd "$(dirname "$0")/.."

sql() { # ejecuta un archivo SQL vía Management API (misma vía que el MCP de Supabase)
  local f=$1
  python3 - "$f" <<'PY' > /tmp/nm_query.json
import json, sys; print(json.dumps({"query": open(sys.argv[1], encoding="utf-8").read()}))
PY
  curl -sS -f -X POST "$API/database/query" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
    --data @/tmp/nm_query.json > /tmp/nm_query.out
  echo "   ✔ $f → $(head -c 200 /tmp/nm_query.out)"
}

if [ "$FASE" = "fase1" ]; then
  echo "── F2 · migración 004 nm_app_registrar_peso ──"
  sql supabase/migrations/004_nm_app_registrar_peso.sql

  echo "── F3 · Edge Functions (soft: NM_REQUIRE_ACCESS_CODE sin definir) ──"
  for fn in nm-chat nm-scanner nm-shopping; do
    npx -y supabase@latest functions deploy "$fn" --project-ref "$REF" --no-verify-jwt
  done

  echo "── Smoke (sin coste: payload vacío → 400) ──"
  for fn in nm-chat nm-scanner nm-shopping; do
    printf "   %-12s HTTP %s\n" "$fn" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "https://$REF.supabase.co/functions/v1/$fn" -H 'Content-Type: application/json' -d '{}')"
  done
  echo "✔ Fase 1 completada. Ahora: push a GitHub + rebuild en Dokploy (git reset --hard origin/main en el VPS si el clon está anclado)."
  echo "  Cuando nutrimed.nexthorizont.ai sirva el bundle nuevo (login por rpc nm_app_login), ejecutar: $0 fase2"

elif [ "$FASE" = "fase2" ]; then
  echo "── F4.1 · secret NM_REQUIRE_ACCESS_CODE=true (las EF pasan a modo estricto) ──"
  npx -y supabase@latest secrets set "NM_REQUIRE_ACCESS_CODE=true" --project-ref "$REF"

  echo "── F4.2 · migración 005 cierre de lecturas anónimas + revoke RPC de escritura ──"
  sql supabase/migrations/005_nm_cerrar_lecturas_anon.sql

  echo "── Verificación: anon debe ver */0 en las 5 tablas ──"
  ANON="${SUPABASE_ANON_KEY:-$(grep -oE "eyJ[A-Za-z0-9_.-]+" src/lib/supabase.js | head -1)}"
  for t in nm_patients nm_access_codes nm_diet_plans nm_daily_meals nm_shopping_lists nm_weight_records nm_chat_messages nm_medications; do
    cr=$(curl -s -o /dev/null -D - "https://$REF.supabase.co/rest/v1/$t?select=id" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Prefer: count=exact" -H "Range: 0-0" | grep -i '^content-range' | tr -d '\r')
    printf "   %-22s %s\n" "$t" "${cr:-<sin content-range>}"
  done
  echo "✔ Fase 2 completada."
else
  echo "Uso: $0 fase1|fase2" >&2; exit 1
fi
