-- One-time containment after verified deployment and anonymous-access closure.
-- Old codes become unusable. The consultation distributes replacements privately.
-- Never print/export old or new codes, and do not extend expired access or unblock anyone.
BEGIN;
LOCK TABLE public.nm_patients, public.nm_access_codes IN SHARE ROW EXCLUSIVE MODE;
DO $block$
BEGIN
  IF EXISTS (SELECT 1 FROM nm_private.security_actions WHERE action = 'rotate_exposed_codes_20260927') THEN
    RAISE EXCEPTION 'This rotation has already been applied';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.nm_access_codes GROUP BY patient_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Ambiguous access-code records: reconcile before rotating';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(ARRAY[
      'nm_patients','nm_access_codes','nm_weight_records','nm_medications',
      'nm_chat_conversations','nm_chat_messages','nm_daily_meals','nm_diet_plans','nm_shopping_lists'
    ]) AS t(name)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policies pol
      WHERE pol.schemaname = 'public' AND pol.tablename = t.name
        AND pol.policyname = 'nm_deny_direct_anon' AND pol.permissive = 'RESTRICTIVE'
        AND 'anon' = ANY(pol.roles) AND pol.cmd = 'ALL'
        AND pol.qual = 'false' AND pol.with_check = 'false'
    )
  ) THEN
    RAISE EXCEPTION 'Close and verify anonymous table access before rotating';
  END IF;
END
$block$;
CREATE TEMP TABLE nm_rotation ON COMMIT DROP AS
SELECT p.id, upper(replace(gen_random_uuid()::text, '-', '')) AS new_code,
       coalesce(p.is_blocked, false) OR coalesce(ac.is_blocked, false) AS blocked,
       least(p.code_expiry, ac.code_expiry) AS expiry
FROM public.nm_patients p
LEFT JOIN public.nm_access_codes ac ON ac.patient_id = p.id
WHERE p.access_code IS NOT NULL OR ac.id IS NOT NULL;
DO $block$
BEGIN
  IF EXISTS (SELECT 1 FROM nm_rotation GROUP BY new_code HAVING count(*) > 1)
    OR EXISTS (SELECT 1 FROM nm_rotation r JOIN public.nm_patients p ON upper(btrim(p.access_code)) = r.new_code)
    OR EXISTS (SELECT 1 FROM nm_rotation r JOIN public.nm_access_codes ac ON upper(btrim(ac.access_code)) = r.new_code) THEN
    RAISE EXCEPTION 'Random-code collision: retry transaction';
  END IF;
END
$block$;
UPDATE public.nm_patients p
SET access_code = r.new_code, is_blocked = r.blocked, code_expiry = r.expiry, updated_at = now()
FROM nm_rotation r WHERE p.id = r.id;
UPDATE public.nm_access_codes ac
SET access_code = r.new_code, is_blocked = r.blocked, code_expiry = r.expiry,
    patient_data = coalesce(ac.patient_data, '{}'::jsonb) - 'access_code' - 'code' - 'password' - 'token',
    updated_at = now()
FROM nm_rotation r WHERE ac.patient_id = r.id;
INSERT INTO nm_private.security_actions(action, affected_patients)
SELECT 'rotate_exposed_codes_20260927', count(*) FROM nm_rotation;
-- Return an aggregate only. No clinical values or bearer codes leave the database.
SELECT count(*) AS patients_rotated FROM nm_rotation;
COMMIT;
