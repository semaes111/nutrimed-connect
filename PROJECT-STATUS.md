# NutriMed Connect — Project Status

## Stack
- **Frontend**: Vite + React 18 + Tailwind CSS + Lucide React
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions, RLS)
- **AI Chatbot**: DeepSeek v4-flash (classify + format, endpoint Anthropic-compat)
- **AI Scanner**: Gemini 2.5 Flash (visión de etiquetas) + DeepSeek v4-flash (razonamiento dietético)
- **Deployment**: Docker + nginx → Dokploy/VPS

## Database: 19 tables (nm_ prefix) — todas con RLS
| Table | Records | Purpose |
|-------|---------|---------|
| nm_professionals | 1+ | Doctors/nutritionists |
| nm_patients | 1+ | Patient clinical data |
| nm_access_codes | Per patient | Temporary login codes |
| nm_diet_catalog | 8+ | Diet type definitions |
| nm_diet_plans | Per patient/day | Weekly diet assignments |
| nm_daily_meals | Per patient/day | Meal schedule |
| nm_food_knowledge | 120+ | Allowed foods per diet |
| nm_meal_catalog | 80+ | Lunch/dinner options |
| nm_breakfast_catalog | 4+ | Breakfast templates |
| nm_snack_catalog | 3+ | Snack options |
| nm_recipes | Variable | Recipe library |
| nm_medications | Per patient | Active prescriptions |
| nm_weight_records | Per patient | Weight tracking history |
| nm_chat_conversations | Per patient | Chat sessions |
| nm_chat_messages | Per conversation | Chat messages + AI metadata |
| nm_shopping_lists | Per patient | Lista de la compra vigente (is_current) |
| nm_informes_paciente | Per patient | Informes (soft-delete, cron nm_cleanup_run) |
| nm_premium_codes | — | Códigos premium (solo service_role) |
| nm_cleanup_log | Per run | Auditoría del cron de limpieza (RLS sin policies: solo service_role) |

## Edge Functions
| Function | Version | Architecture |
|----------|---------|-------------|
| nm-chat | v17.2 | DeepSeek classify → RAG (DIET_FALLBACK + rotación/día) → DeepSeek format · autoriza access_code |
| nm-scanner | v3.1 | Gemini visión → RAG dieta → DeepSeek diet-check → veredicto TS · autoriza access_code · imagen ≤ 4 MB |
| nm-shopping | v8.1 | Sin IA (determinista desde catálogos) · autoriza access_code (paciente) o JWT (profesional) |

### nm-chat Architecture (3-phase hybrid)
1. **Phase 1 — CLASSIFY** (deepseek-v4-flash, thinking disabled, ~1.4s): Intent classification into 11 categories
2. **Phase 2 — RAG** (Supabase queries, ~300-600ms, $0): Fetch relevant data based on intent
3. **Phase 3 — FORMAT** (deepseek-v4-flash, thinking disabled): Generate natural response

### Historial de proveedores IA (contexto para futuras migraciones)
Claude (mar) → MiMo por coste (abr) → 3 incidencias MiMo: key revocada (may),
modelos retirados (jul), key revocada otra vez (ago) → DeepSeek + Gemini (2026-08-11).
La API oficial de DeepSeek NO acepta imágenes — por eso la visión del escáner va por Gemini.

### Supported intents
alimento_permitido, alimento_alternativa, dieta_info, comida_sugerencia,
horario_comidas, receta_consulta, medicacion, peso_progreso, saludo, despedida, otro

## Modelo de acceso del paciente (desde 2026-10-22)
- El paciente NO usa Supabase Auth: se identifica con su código de acceso (`nm_access_codes`).
- Todas sus lecturas van por las RPC SECURITY DEFINER `nm_app_*(p_codigo)` (migración 020) y su
  peso se guarda con `nm_app_registrar_peso` (migración 004): cada función devuelve SOLO las filas
  del dueño del código. La anon key no debe poder leer tablas de paciente (migración 005).
- Las Edge Functions validan `access_code` ↔ `patient_id` (`_shared/patientAuth.ts`); el profesional
  se valida por JWT. Secret `NM_REQUIRE_ACCESS_CODE=true` activa el modo estricto.
- Historial: 27-sep-2026 la migración `seguridad_019_politicas_rls` (proyecto compartido) cerró las
  lecturas anon de pesos/chat/medicación y la app paciente quedó sin esos datos hasta este cambio.
- ⚠️ El proyecto Supabase es compartido con otras apps: tras cualquier migración de seguridad,
  verificar con la anon key (`Prefer: count=exact`) las 9 tablas de paciente y las RPC `nm_app_*`.

## Deployment
- **Supabase**: bpazmmbjjducdmxgfoum.supabase.co
- **VPS**: 31.97.69.100 (Hostinger)
- **Secrets required**: DEEPSEEK_API_KEY + GEMINI_API_KEY + NM_REQUIRE_ACCESS_CODE=true (in Supabase Edge Function secrets). MIMO_API_KEY y ANTHROPIC_API_KEY obsoletos.
- **Deploy EF + migraciones**: `scripts/deploy-acceso-paciente-2026-10-22.sh fase1|fase2`

## Last updated: 2026-10-22
