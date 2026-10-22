-- 004 · NutriMed: el paciente registra su peso con su código (2026-10-22)
-- Supabase bpazmmbjjducdmxgfoum · Complementa la migración 020 (nutrimed_020_acceso_paciente_por_codigo).
--
-- Qué había. La app escribía con la clave anónima: INSERT en nm_weight_records (policy anon insert) y
-- UPDATE de nm_patients.current_weight, que NO tiene policy anon UPDATE → el peso actual del paciente
-- se perdía en silencio (PostgREST devuelve 200 con 0 filas).
-- Qué hace. Una sola función SECURITY DEFINER que valida el código (nm_app_paciente_id, igual que el
-- resto de nm_app_*), guarda el peso del día (actualiza el registro del mismo día SOLO si lo registró
-- el propio paciente; nunca pisa medidas del profesional o del formulario) y sincroniza current_weight.
-- Solo añade una función: no cambia políticas ni datos.
create or replace function public.nm_app_registrar_peso(
  p_codigo text,
  p_peso   numeric,
  p_fecha  date default current_date,
  p_nota   text default null
) returns setof public.nm_weight_records
language plpgsql security definer set search_path to 'pg_catalog' as $f$
declare
  v_patient uuid := public.nm_app_paciente_id(p_codigo);
  v_fecha   date := coalesce(p_fecha, current_date);
  v_nota    text := nullif(btrim(coalesce(p_nota, '')), '');
  v_id      uuid;
begin
  if v_patient is null then
    raise exception 'codigo_invalido' using errcode = '28000';
  end if;
  if p_peso is null or p_peso <= 20 or p_peso >= 400 then
    raise exception 'peso_invalido' using errcode = '22023';
  end if;

  select w.id into v_id
    from public.nm_weight_records w
   where w.patient_id = v_patient and w.date = v_fecha and w.recorded_by = 'patient'
   order by w.created_at desc limit 1;

  if v_id is not null then
    update public.nm_weight_records set weight = p_peso, notes = v_nota where id = v_id;
  else
    insert into public.nm_weight_records (patient_id, weight, date, notes, recorded_by)
    values (v_patient, p_peso, v_fecha, v_nota, 'patient')
    returning id into v_id;
  end if;

  update public.nm_patients set current_weight = p_peso, updated_at = now() where id = v_patient;

  return query select w.* from public.nm_weight_records w where w.id = v_id;
end $f$;

revoke all on function public.nm_app_registrar_peso(text, numeric, date, text) from public;
grant execute on function public.nm_app_registrar_peso(text, numeric, date, text) to anon, authenticated, service_role;
