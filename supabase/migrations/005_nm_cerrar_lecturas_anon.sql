-- 005 · NutriMed: cierre de las lecturas anónimas y de las RPC de escritura abiertas (2026-10-22)
-- Supabase bpazmmbjjducdmxgfoum · Es el bloque «después de publicar la app» de la migración 020.
--
-- ⚠️ APLICAR SOLO cuando el frontend con las lecturas por RPC (commit f203fdc o posterior) esté
--    publicado en nutrimed.nexthorizont.ai y el secret NM_REQUIRE_ACCESS_CODE=true esté activo.
--    Con el bundle antiguo, estas policies son las que permiten el login del paciente.
--
-- Qué había (verificado el 22-10-2026 con la anon key pública, REST Prefer: count=exact):
--   nm_patients 447 filas · nm_access_codes 447 (170 códigos vigentes) · nm_diet_plans 86 ·
--   nm_daily_meals 26 · nm_shopping_lists 49 → ficha clínica completa y códigos de acceso de
--   todos los pacientes legibles por cualquiera; suplantación de cualquier paciente.
--   RPC SECURITY DEFINER ejecutables por anon: assign_base_diet, override_day_diet,
--   remove_day_override, upsert_daily_meal (escritura de dietas/menús de cualquier paciente),
--   nm_cleanup_run (borrado programado + aviso Telegram), fn_integrate_form_to_nm_patients (trigger).
-- Qué hace. Deja a anon sin lectura de tablas de paciente (las lecturas van por nm_app_*, que
--   devuelven solo las filas del dueño del código) y sin EXECUTE en las RPC de escritura
--   (el panel profesional las llama con JWT authenticated; los cron/EF usan service_role).
-- Reversible: cada policy se recrea con el CREATE POLICY equivalente (expresiones abajo en comentario).

begin;

-- 005.1 · Lecturas anónimas de datos de paciente
drop policy if exists nm_patients_anon_read_for_login on public.nm_patients;   -- era: SELECT TO anon USING (is_blocked = false)
drop policy if exists nm_ac_anon_select               on public.nm_access_codes; -- era: SELECT TO anon USING (is_blocked = false)
drop policy if exists anon_read_daily_meals           on public.nm_daily_meals;  -- era: SELECT TO anon USING (is_active = true)
drop policy if exists nm_dp_anon_select               on public.nm_diet_plans;   -- era: SELECT TO anon USING (is_active = true)
drop policy if exists nm_shopping_anon_select         on public.nm_shopping_lists; -- era: SELECT TO anon USING (is_current = true)

-- 005.2 · (FASE POSTERIOR, no se ejecuta aquí) Escrituras anónimas que la app ya no usa: el peso va
--         por nm_app_registrar_peso y el chat lo persiste la EF con service_role. Antes de retirarlas
--         confirmar que ningún flujo n8n/formulario inserta con la anon key:
--   drop policy if exists nm_wr_anon_insert        on public.nm_weight_records;     -- INSERT TO anon WITH CHECK (true)
--   drop policy if exists nm_chat_conv_anon_insert on public.nm_chat_conversations; -- INSERT TO anon WITH CHECK (true)
--   drop policy if exists nm_chat_msg_anon_insert  on public.nm_chat_messages;      -- INSERT TO anon WITH CHECK (true)
--   drop policy if exists anon_insert_daily_meals  on public.nm_daily_meals;        -- INSERT TO anon WITH CHECK (true)
--   drop policy if exists nm_ac_anon_insert        on public.nm_access_codes;       -- INSERT TO anon WITH CHECK (true)

-- 005.3 · RPC de escritura: solo authenticated (panel profesional) y service_role
revoke execute on function public.assign_base_diet(uuid, uuid, uuid, text, text, text) from anon, public;
revoke execute on function public.override_day_diet(uuid, uuid, uuid, text, text, text, text) from anon, public;
revoke execute on function public.remove_day_override(uuid, text) from anon, public;
revoke execute on function public.upsert_daily_meal(uuid, uuid, text, text, text, text, text, text, text) from anon, public;
revoke execute on function public.nm_cleanup_run() from anon, authenticated, public;          -- solo pg_cron / service_role
revoke execute on function public.fn_integrate_form_to_nm_patients() from anon, authenticated, public; -- trigger

commit;

-- Verificación (anon key pública): las 5 tablas deben devolver Content-Range: */0
--   for t in nm_patients nm_access_codes nm_diet_plans nm_daily_meals nm_shopping_lists; do
--     curl -s -o /dev/null -D - "https://bpazmmbjjducdmxgfoum.supabase.co/rest/v1/$t?select=id" \
--       -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Prefer: count=exact" -H "Range: 0-0" | grep -i content-range
--   done
-- y el login del paciente sigue funcionando vía rpc nm_app_login.
