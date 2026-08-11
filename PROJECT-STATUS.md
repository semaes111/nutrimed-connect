# NutriMed Connect — Project Status

## Stack
- **Frontend**: Vite + React 18 + Tailwind CSS + Lucide React
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions, RLS)
- **AI Chatbot**: DeepSeek v4-flash (classify + format, endpoint Anthropic-compat)
- **AI Scanner**: Gemini 2.5 Flash (visión de etiquetas) + DeepSeek v4-flash (razonamiento dietético)
- **Deployment**: Docker + nginx → Dokploy/VPS

## Database: 15 tables (nm_ prefix)
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

## Edge Functions
| Function | Version | Architecture |
|----------|---------|-------------|
| nm-chat | v17 | DeepSeek classify → RAG → DeepSeek format |
| nm-scanner | v3.0 | Gemini visión → RAG dieta → DeepSeek diet-check → veredicto TS |
| nm-shopping | v1 | Sin IA (solo Supabase) |

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

## Deployment
- **Supabase**: bpazmmbjjducdmxgfoum.supabase.co
- **VPS**: 31.97.69.100 (Hostinger)
- **Secrets required**: DEEPSEEK_API_KEY + GEMINI_API_KEY (in Supabase Edge Function secrets). MIMO_API_KEY y ANTHROPIC_API_KEY obsoletos.

## Last updated: 2026-08-11
