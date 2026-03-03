# NutriMed Connect — Project Status

## Stack
- **Frontend**: Vite + React 18 + Tailwind CSS + Lucide React
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions, RLS)
- **AI Chatbot**: Claude Haiku 3 (classify) + Claude Sonnet 4.5 (format)
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
| nm-chat | v11 | Haiku classify → RAG → Sonnet format |

### nm-chat Architecture (3-phase hybrid)
1. **Phase 1 — CLASSIFY** (Haiku 3, ~400ms, $0.0003/msg): Intent classification into 11 categories
2. **Phase 2 — RAG** (Supabase queries, ~300-600ms, $0): Fetch relevant data based on intent
3. **Phase 3 — FORMAT** (Sonnet 4.5, ~2-3s, $0.0035/msg): Generate natural response

**Cost per message**: ~$0.004 | **200 msgs/day**: ~$24/month

### Supported intents
alimento_permitido, alimento_alternativa, dieta_info, comida_sugerencia,
horario_comidas, receta_consulta, medicacion, peso_progreso, saludo, despedida, otro

## Deployment
- **Supabase**: bpazmmbjjducdmxgfoum.supabase.co
- **VPS**: 31.97.69.100 (Hostinger)
- **Secrets required**: ANTHROPIC_API_KEY (in Supabase Edge Function secrets)

## Last updated: 2026-03-03
