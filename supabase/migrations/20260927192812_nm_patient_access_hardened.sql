-- Additive, compatible replacement for the supplied 020 RPCs.
-- Cutover / rotation live in supabase/deploy and must not run in a generic migration push.
BEGIN;
CREATE SCHEMA IF NOT EXISTS nm_private;
REVOKE ALL ON SCHEMA nm_private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS nm_private.security_actions (
  action text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now(),
  affected_patients bigint NOT NULL
);
REVOKE ALL ON nm_private.security_actions FROM PUBLIC, anon, authenticated;

-- Code possession is the legacy patient credential. Both stores must agree, if present.
-- Reject ambiguity; never fall back from a blocked/expired nm_access_codes row.
CREATE OR REPLACE FUNCTION nm_private.patient_id(p_codigo text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $f$
  WITH input AS (
    SELECT upper(btrim(coalesce(p_codigo, ''))) AS code
    WHERE char_length(btrim(coalesce(p_codigo, ''))) BETWEEN 4 AND 64
  ), matches AS (
    SELECT p.id FROM public.nm_patients p, input i WHERE upper(btrim(p.access_code)) = i.code
    UNION
    SELECT ac.patient_id FROM public.nm_access_codes ac, input i WHERE upper(btrim(ac.access_code)) = i.code
  ), candidate AS (
    SELECT id FROM matches WHERE (SELECT count(*) FROM matches) = 1
  )
  SELECT p.id
  FROM public.nm_patients p JOIN candidate c ON c.id = p.id CROSS JOIN input i
  WHERE NOT coalesce(p.is_blocked, false)
    AND (p.code_expiry IS NULL OR p.code_expiry > now())
    AND (p.access_code IS NULL OR upper(btrim(p.access_code)) = i.code)
    AND (
      (NOT EXISTS (SELECT 1 FROM public.nm_access_codes ac WHERE ac.patient_id = p.id)
       AND upper(btrim(p.access_code)) = i.code)
      OR (
        (SELECT count(*) FROM public.nm_access_codes ac WHERE ac.patient_id = p.id) = 1
        AND EXISTS (
          SELECT 1 FROM public.nm_access_codes ac
          WHERE ac.patient_id = p.id AND upper(btrim(ac.access_code)) = i.code
            AND NOT coalesce(ac.is_blocked, false)
            AND (ac.code_expiry IS NULL OR ac.code_expiry > now())
        )
      )
    )
$f$;
REVOKE ALL ON FUNCTION nm_private.patient_id(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.nm_app_paciente_id(p_codigo text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $f$
  SELECT nm_private.patient_id(p_codigo)
$f$;
REVOKE ALL ON FUNCTION public.nm_app_paciente_id(text) FROM PUBLIC, anon, authenticated;

-- Server-only authorization endpoint: no patient record leaves this function.
CREATE OR REPLACE FUNCTION public.nm_app_autorizar(p_codigo text)
RETURNS TABLE(id uuid, professional_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $f$
  SELECT p.id, p.professional_id FROM public.nm_patients p
  WHERE p.id = nm_private.patient_id(p_codigo)
$f$;
REVOKE ALL ON FUNCTION public.nm_app_autorizar(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nm_app_autorizar(text) TO service_role;

create or replace function public.nm_app_login(p_codigo text) returns setof public.nm_patients
language sql stable security definer set search_path to 'pg_catalog' as $f$
  select p.* from public.nm_patients p where p.id = public.nm_app_paciente_id(p_codigo) $f$;

create or replace function public.nm_app_pesos(p_codigo text) returns setof public.nm_weight_records
language sql stable security definer set search_path to 'pg_catalog' as $f$
  select w.* from public.nm_weight_records w where w.patient_id = public.nm_app_paciente_id(p_codigo) $f$;

create or replace function public.nm_app_medicaciones(p_codigo text) returns setof public.nm_medications
language sql stable security definer set search_path to 'pg_catalog' as $f$
  select m.* from public.nm_medications m where m.patient_id = public.nm_app_paciente_id(p_codigo) $f$;

create or replace function public.nm_app_conversaciones(p_codigo text) returns setof public.nm_chat_conversations
language sql stable security definer set search_path to 'pg_catalog' as $f$
  select c.* from public.nm_chat_conversations c where c.patient_id = public.nm_app_paciente_id(p_codigo) $f$;

create or replace function public.nm_app_mensajes(p_codigo text, p_conversation_id uuid default null)
returns setof public.nm_chat_messages
language sql stable security definer set search_path to 'pg_catalog' as $f$
  select m.* from public.nm_chat_messages m
    join public.nm_chat_conversations c on c.id = m.conversation_id
   where c.patient_id = public.nm_app_paciente_id(p_codigo)
     and (p_conversation_id is null or m.conversation_id = p_conversation_id) $f$;

create or replace function public.nm_app_comidas(p_codigo text) returns setof public.nm_daily_meals
language sql stable security definer set search_path to 'pg_catalog' as $f$
  select d.* from public.nm_daily_meals d where d.is_active and d.patient_id = public.nm_app_paciente_id(p_codigo) $f$;

create or replace function public.nm_app_dietas(p_codigo text) returns setof public.nm_diet_plans
language sql stable security definer set search_path to 'pg_catalog' as $f$
  select d.* from public.nm_diet_plans d where d.is_active and d.patient_id = public.nm_app_paciente_id(p_codigo) $f$;

create or replace function public.nm_app_lista_compra(p_codigo text) returns setof public.nm_shopping_lists
language sql stable security definer set search_path to 'pg_catalog' as $f$
  select s.* from public.nm_shopping_lists s where s.is_current and s.patient_id = public.nm_app_paciente_id(p_codigo) $f$;

do $$
declare f text;
begin
  foreach f in array array['nm_app_login(text)','nm_app_pesos(text)','nm_app_medicaciones(text)','nm_app_conversaciones(text)',
                           'nm_app_mensajes(text,uuid)','nm_app_comidas(text)','nm_app_dietas(text)','nm_app_lista_compra(text)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;


-- An entire weight save (record + current_weight) is atomic and scoped by credential.
CREATE OR REPLACE FUNCTION public.nm_app_guardar_peso(
  p_codigo text, p_peso numeric, p_fecha date DEFAULT current_date, p_notas text DEFAULT NULL
) RETURNS SETOF public.nm_weight_records
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $f$
DECLARE pid uuid; rid uuid;
BEGIN
  pid := nm_private.patient_id(p_codigo);
  IF pid IS NULL THEN RAISE EXCEPTION 'Acceso no autorizado' USING ERRCODE = '42501'; END IF;
  IF p_peso IS NULL OR p_peso::text IN ('NaN','Infinity','-Infinity') OR p_peso < 30 OR p_peso > 300
     OR p_fecha IS NULL OR p_fecha <> current_date OR char_length(coalesce(p_notas, '')) > 2000 THEN
    RAISE EXCEPTION 'Registro no válido' USING ERRCODE = '22023';
  END IF;
  -- Patient-row lock serializes concurrent saves, regeneration and blocking.
  PERFORM 1 FROM public.nm_patients WHERE id = pid FOR UPDATE;
  IF nm_private.patient_id(p_codigo) IS DISTINCT FROM pid THEN
    RAISE EXCEPTION 'Acceso no autorizado' USING ERRCODE = '42501';
  END IF;
  SELECT w.id INTO rid FROM public.nm_weight_records w
  WHERE w.patient_id = pid AND w.date = p_fecha ORDER BY w.created_at DESC, w.id LIMIT 1;
  IF rid IS NULL THEN
    INSERT INTO public.nm_weight_records(patient_id, weight, date, notes, recorded_by)
    VALUES(pid, p_peso, p_fecha, p_notas, 'patient') RETURNING id INTO rid;
  ELSE
    UPDATE public.nm_weight_records SET weight = p_peso, notes = p_notas, recorded_by = 'patient' WHERE id = rid;
  END IF;
  UPDATE public.nm_patients SET current_weight = p_peso, updated_at = now() WHERE id = pid;
  RETURN QUERY SELECT w.* FROM public.nm_weight_records w WHERE w.id = rid;
END
$f$;
REVOKE ALL ON FUNCTION public.nm_app_guardar_peso(text,numeric,date,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nm_app_guardar_peso(text,numeric,date,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION nm_private.is_professional(p_professional_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $f$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.nm_professionals pr
    WHERE pr.id = p_professional_id AND pr.auth_user_id = auth.uid() AND pr.is_active
  )
$f$;
CREATE OR REPLACE FUNCTION nm_private.owns_patient(p_patient_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $f$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.nm_patients p
    WHERE p.id = p_patient_id AND nm_private.is_professional(p.professional_id)
  )
$f$;
CREATE OR REPLACE FUNCTION nm_private.owns_conversation(p_conversation_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $f$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.nm_chat_conversations c
    WHERE c.id = p_conversation_id AND nm_private.owns_patient(c.patient_id)
  )
$f$;
REVOKE ALL ON FUNCTION nm_private.is_professional(uuid), nm_private.owns_patient(uuid),
  nm_private.owns_conversation(uuid) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA nm_private TO authenticated;
GRANT EXECUTE ON FUNCTION nm_private.is_professional(uuid), nm_private.owns_patient(uuid),
  nm_private.owns_conversation(uuid) TO authenticated;

-- Random UUID v4 material (122 random bits), no Math.random(), no browser credential generation.
CREATE OR REPLACE FUNCTION public.nm_pro_regenerar_codigo(p_patient_id uuid)
RETURNS TABLE(access_code text, code_expiry timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $f$
DECLARE new_code text; expiry timestamptz := now() + interval '28 days';
BEGIN
  IF NOT nm_private.owns_patient(p_patient_id) THEN
    RAISE EXCEPTION 'Acceso no autorizado' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.nm_patients WHERE id = p_patient_id FOR UPDATE;
  IF NOT nm_private.owns_patient(p_patient_id) THEN
    RAISE EXCEPTION 'Acceso no autorizado' USING ERRCODE = '42501';
  END IF;
  IF (SELECT count(*) FROM public.nm_access_codes WHERE patient_id = p_patient_id) > 1 THEN
    RAISE EXCEPTION 'Revisar registros de acceso duplicados';
  END IF;
  LOOP
    new_code := upper(replace(gen_random_uuid()::text, '-', ''));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.nm_access_codes ac WHERE upper(btrim(ac.access_code)) = new_code)
      AND NOT EXISTS (SELECT 1 FROM public.nm_patients p WHERE upper(btrim(p.access_code)) = new_code);
  END LOOP;
  UPDATE public.nm_patients SET access_code = new_code, code_expiry = expiry, is_blocked = false, updated_at = now()
  WHERE id = p_patient_id;
  UPDATE public.nm_access_codes SET access_code = new_code, code_expiry = expiry, is_blocked = false,
    patient_data = coalesce(patient_data, '{}'::jsonb) - 'access_code' - 'code' - 'password' - 'token', updated_at = now()
  WHERE patient_id = p_patient_id;
  IF NOT FOUND THEN
    INSERT INTO public.nm_access_codes(patient_id, access_code, code_expiry, is_blocked)
    VALUES (p_patient_id, new_code, expiry, false);
  END IF;
  RETURN QUERY SELECT new_code, expiry;
END
$f$;
REVOKE ALL ON FUNCTION public.nm_pro_regenerar_codigo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nm_pro_regenerar_codigo(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.nm_pro_bloquear_acceso(p_patient_id uuid, p_bloqueado boolean)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $f$
BEGIN
  IF p_bloqueado IS NULL OR NOT nm_private.owns_patient(p_patient_id) THEN
    RAISE EXCEPTION 'Acceso no autorizado' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.nm_patients WHERE id = p_patient_id FOR UPDATE;
  IF NOT nm_private.owns_patient(p_patient_id) THEN
    RAISE EXCEPTION 'Acceso no autorizado' USING ERRCODE = '42501';
  END IF;
  UPDATE public.nm_patients SET is_blocked = p_bloqueado, updated_at = now() WHERE id = p_patient_id;
  UPDATE public.nm_access_codes SET is_blocked = p_bloqueado, updated_at = now() WHERE patient_id = p_patient_id;
END
$f$;
REVOKE ALL ON FUNCTION public.nm_pro_bloquear_acceso(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nm_pro_bloquear_acceso(uuid,boolean) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
