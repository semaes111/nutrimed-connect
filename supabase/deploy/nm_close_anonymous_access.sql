-- Run ONLY after the new web/native client and all three Edge Functions are verified.
-- Deliberately separate from additive migrations: a generic `db push` must not cut over clients.
BEGIN;
DO $block$
DECLARE t text; legacy record; intake_definition text;
BEGIN
  -- These server jobs bypass RLS and must never be callable with a public app key.
  -- Do not invoke cleanup here: it deletes records and sends notifications.
  FOR legacy IN
    SELECT p.oid::regprocedure::text AS signature
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('nm_cleanup_run','process_form_intake')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', legacy.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', legacy.signature);
  END LOOP;

  -- Preserve the live intake implementation and its medical mapping. Replace only the
  -- verified weak-code expression, failing closed if the implementation has drifted.
  IF to_regprocedure('public.process_form_intake(uuid)') IS NOT NULL THEN
    SELECT pg_get_functiondef('public.process_form_intake(uuid)'::regprocedure)
      INTO intake_definition;
    IF position('upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6))' IN intake_definition) > 0 THEN
      EXECUTE replace(intake_definition,
        'upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6))',
        'upper(replace(gen_random_uuid()::text, ''-'', ''''))');
    ELSIF position('upper(replace(gen_random_uuid()::text, ''-'', ''''))' IN intake_definition) = 0 THEN
      RAISE EXCEPTION 'Review process_form_intake code generation before cutover';
    END IF;
  END IF;

  -- Reports and maintenance tables are consumed by trusted server integrations.
  -- The old postgres-owned view otherwise bypasses the report table's RLS.
  FOREACH t IN ARRAY ARRAY['nm_informes_paciente','nm_premium_codes','nm_cleanup_log'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
      EXECUTE format('GRANT ALL PRIVILEGES ON TABLE public.%I TO service_role', t);
    END IF;
  END LOOP;
  IF to_regclass('public.nm_informes_paciente_active') IS NOT NULL THEN
    ALTER VIEW public.nm_informes_paciente_active SET (security_invoker = true);
    REVOKE ALL PRIVILEGES ON public.nm_informes_paciente_active FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON public.nm_informes_paciente_active TO service_role;
  END IF;
  FOR legacy IN
    SELECT p.oid::regprocedure::text AS signature
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (
      'get_patient_weekly_diet','upsert_daily_meal','assign_base_diet','override_day_diet','remove_day_override'
    )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', legacy.signature);
    -- Legacy helpers must run under the caller RLS, never bypass the ownership restrictions.
    EXECUTE format('ALTER FUNCTION %s SECURITY INVOKER', legacy.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', legacy.signature);
  END LOOP;
  FOREACH t IN ARRAY ARRAY[
    'nm_patients','nm_access_codes','nm_weight_records','nm_medications',
    'nm_chat_conversations','nm_chat_messages','nm_daily_meals','nm_diet_plans','nm_shopping_lists'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon', t);
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    -- A restrictive deny also protects against unknown permissive policies granted TO PUBLIC.
    EXECUTE format('DROP POLICY IF EXISTS nm_deny_direct_anon ON public.%I', t);
    EXECUTE format('CREATE POLICY nm_deny_direct_anon ON public.%I AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false)', t);
  END LOOP;
  -- Authenticated is not synonymous with professional. Constrain permissive legacy rules.
  FOREACH t IN ARRAY ARRAY[
    'nm_patients','nm_access_codes','nm_weight_records','nm_medications',
    'nm_chat_conversations','nm_chat_messages','nm_daily_meals','nm_diet_plans','nm_shopping_lists'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS nm_professional_scope ON public.%I', t);
    EXECUTE format('CREATE POLICY nm_professional_scope ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
      t,
      CASE t WHEN 'nm_patients' THEN 'nm_private.is_professional(professional_id)'
        WHEN 'nm_chat_messages' THEN 'nm_private.owns_conversation(conversation_id)'
        ELSE 'nm_private.owns_patient(patient_id)' END,
      CASE t WHEN 'nm_patients' THEN 'nm_private.is_professional(professional_id)'
        WHEN 'nm_chat_messages' THEN 'nm_private.owns_conversation(conversation_id)'
        ELSE 'nm_private.owns_patient(patient_id)' END);
    EXECUTE format('DROP POLICY IF EXISTS nm_professional_access ON public.%I', t);
    EXECUTE format('CREATE POLICY nm_professional_access ON public.%I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
      t,
      CASE t WHEN 'nm_patients' THEN 'nm_private.is_professional(professional_id)'
        WHEN 'nm_chat_messages' THEN 'nm_private.owns_conversation(conversation_id)'
        ELSE 'nm_private.owns_patient(patient_id)' END,
      CASE t WHEN 'nm_patients' THEN 'nm_private.is_professional(professional_id)'
        WHEN 'nm_chat_messages' THEN 'nm_private.owns_conversation(conversation_id)'
        ELSE 'nm_private.owns_patient(patient_id)' END);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END
$block$;
-- Remove the known obsolete rules as well. Alternate legacy names cannot bypass the deny above.
DROP POLICY IF EXISTS nm_patients_anon_read_for_login ON public.nm_patients;
DROP POLICY IF EXISTS nm_ac_anon_select ON public.nm_access_codes;
DROP POLICY IF EXISTS anon_read_daily_meals ON public.nm_daily_meals;
DROP POLICY IF EXISTS nm_dp_anon_select ON public.nm_diet_plans;
DROP POLICY IF EXISTS nm_shopping_anon_select ON public.nm_shopping_lists;
NOTIFY pgrst, 'reload schema';
COMMIT;
