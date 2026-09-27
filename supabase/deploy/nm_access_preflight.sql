-- Administrative READ-ONLY preflight. Metadata/aggregates only; no codes, names or clinical values.
BEGIN READ ONLY;
SELECT current_database() AS database_name, current_setting('server_version') AS server_version;
SELECT c.relname AS table_name, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls,
       pg_catalog.pg_get_userbyid(c.relowner) AS owner
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND c.relname LIKE 'nm_%'
ORDER BY c.relname;
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name LIKE 'nm_%'
  AND (column_name IN ('patient_id','professional_id','access_code','code_expiry','is_blocked','patient_data','auth_user_id')
       OR table_name IN ('nm_patients','nm_weight_records','nm_access_codes'))
ORDER BY table_name, ordinal_position;
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public' AND tablename LIKE 'nm_%'
ORDER BY tablename, policyname;
SELECT p.oid::regprocedure::text AS function_signature, p.prosecdef AS security_definer,
       p.proconfig AS function_settings,
       has_function_privilege('anon', p.oid, 'execute') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'execute') AS authenticated_execute,
       p.prosrc ~* 'nm_(patients|access_codes|weight_records|medications|chat_|daily_meals|diet_plans|shopping_lists|informes_paciente)' AS references_clinical_tables
FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND (p.proname LIKE 'nm_%' OR p.proname IN ('get_patient_weekly_diet','upsert_daily_meal',
      'assign_base_diet','override_day_diet','remove_day_override','process_form_intake','fn_integrate_form_to_nm_patients')
    OR p.prosrc ~* 'nm_(patients|access_codes|weight_records|medications|chat_|daily_meals|diet_plans|shopping_lists|informes_paciente)')
ORDER BY 1;
SELECT 'duplicate_code_patients' AS check_name, count(*) AS problem_count
FROM (SELECT upper(btrim(access_code)) FROM public.nm_patients WHERE access_code IS NOT NULL
      GROUP BY upper(btrim(access_code)) HAVING count(*) > 1) d
UNION ALL
SELECT 'multiple_code_records_per_patient', count(*)
FROM (SELECT patient_id FROM public.nm_access_codes GROUP BY patient_id HAVING count(*) > 1) d
UNION ALL
SELECT 'mismatched_code_stores', count(*)
FROM public.nm_patients p JOIN public.nm_access_codes ac ON ac.patient_id=p.id
WHERE p.access_code IS NOT NULL AND upper(btrim(p.access_code)) IS DISTINCT FROM upper(btrim(ac.access_code))
UNION ALL
SELECT 'patients_without_active_professional', count(*)
FROM public.nm_patients p LEFT JOIN public.nm_professionals pr ON pr.id=p.professional_id AND pr.is_active
WHERE pr.id IS NULL;
-- Views can bypass table RLS. Inspect these before asserting a complete closure.
SELECT schemaname, viewname, viewowner, definition
FROM pg_catalog.pg_views WHERE schemaname='public'
  AND definition ~* 'nm_(patients|access_codes|weight_records|medications|chat_|daily_meals|diet_plans|shopping_lists|informes_paciente)';
SELECT c.relname, c.reloptions,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='v' AND c.relname LIKE 'nm_%';
COMMIT;
