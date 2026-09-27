-- Production definitions inspected on 2026-09-27. No patient data or credentials.
CREATE OR REPLACE FUNCTION public.assign_base_diet(p_patient_id uuid, p_professional_id uuid, p_dieta_valida_id uuid, p_diet_type text, p_diet_name text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_result nm_diet_plans;
BEGIN
  -- Desactivar base anterior si existe
  UPDATE nm_diet_plans
  SET is_active = false, updated_at = now()
  WHERE patient_id = p_patient_id
    AND day_of_week = 'todos'
    AND is_active = true;

  -- Insertar nueva base
  INSERT INTO nm_diet_plans (
    patient_id, professional_id, dieta_valida_id,
    diet_type, diet_name, day_of_week, notes, is_active
  ) VALUES (
    p_patient_id, p_professional_id, p_dieta_valida_id,
    p_diet_type, p_diet_name, 'todos', p_notes, true
  ) RETURNING * INTO v_result;

  -- Limpiar menús diarios para que se regeneren con la nueva dieta y rotación
  DELETE FROM nm_daily_meals
  WHERE patient_id = p_patient_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', v_result.id,
    'message', 'Dieta base asignada a todos los días'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_patient_weekly_diet(p_patient_id uuid)
 RETURNS TABLE(day_of_week text, diet_type text, diet_name text, dieta_valida_id uuid, source text, plan_id uuid, notes text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_days TEXT[] := ARRAY['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
  v_day TEXT;
  v_override RECORD;
  v_base RECORD;
BEGIN
  -- Cargar dieta base (todos)
  SELECT dp.id, dp.diet_type, dp.diet_name, dp.dieta_valida_id, dp.notes
  INTO v_base
  FROM nm_diet_plans dp
  WHERE dp.patient_id = p_patient_id
    AND dp.day_of_week = 'todos'
    AND dp.is_active = true
  LIMIT 1;

  -- Para cada día, buscar override o usar base
  FOREACH v_day IN ARRAY v_days LOOP
    SELECT dp.id, dp.diet_type, dp.diet_name, dp.dieta_valida_id, dp.notes
    INTO v_override
    FROM nm_diet_plans dp
    WHERE dp.patient_id = p_patient_id
      AND dp.day_of_week = v_day
      AND dp.is_active = true
    LIMIT 1;

    IF v_override.id IS NOT NULL THEN
      day_of_week := v_day;
      diet_type := v_override.diet_type;
      diet_name := v_override.diet_name;
      dieta_valida_id := v_override.dieta_valida_id;
      source := 'override';
      plan_id := v_override.id;
      notes := v_override.notes;
      RETURN NEXT;
    ELSIF v_base.id IS NOT NULL THEN
      day_of_week := v_day;
      diet_type := v_base.diet_type;
      diet_name := v_base.diet_name;
      dieta_valida_id := v_base.dieta_valida_id;
      source := 'base';
      plan_id := v_base.id;
      notes := v_base.notes;
      RETURN NEXT;
    END IF;

    -- Reset override para siguiente iteración
    v_override := NULL;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.override_day_diet(p_patient_id uuid, p_professional_id uuid, p_dieta_valida_id uuid, p_diet_type text, p_day_of_week text, p_diet_name text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result nm_diet_plans;
BEGIN
  -- Validar que no sea 'todos' (para eso usar assign_base_diet)
  IF p_day_of_week = 'todos' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usar assign_base_diet para asignar a todos los días');
  END IF;

  -- Desactivar override anterior para ese día
  UPDATE nm_diet_plans
  SET is_active = false, updated_at = now()
  WHERE patient_id = p_patient_id
    AND day_of_week = p_day_of_week
    AND is_active = true;

  -- Insertar override
  INSERT INTO nm_diet_plans (
    patient_id, professional_id, dieta_valida_id,
    diet_type, diet_name, day_of_week, notes, is_active
  ) VALUES (
    p_patient_id, p_professional_id, p_dieta_valida_id,
    p_diet_type, p_diet_name, p_day_of_week, p_notes, true
  ) RETURNING * INTO v_result;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', v_result.id,
    'day', p_day_of_week,
    'message', format('Override de %s asignado', p_day_of_week)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.remove_day_override(p_patient_id uuid, p_day_of_week text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted INT;
BEGIN
  UPDATE nm_diet_plans
  SET is_active = false, updated_at = now()
  WHERE patient_id = p_patient_id
    AND day_of_week = p_day_of_week
    AND day_of_week != 'todos'
    AND is_active = true;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', v_deleted > 0,
    'day', p_day_of_week,
    'message', CASE WHEN v_deleted > 0
      THEN format('%s vuelve a usar la dieta base', p_day_of_week)
      ELSE 'No había override activo para ese día'
    END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_daily_meal(p_patient_id uuid, p_professional_id uuid, p_day text, p_breakfast text DEFAULT ''::text, p_lunch text DEFAULT ''::text, p_dinner text DEFAULT ''::text, p_snack_morning text DEFAULT ''::text, p_snack_afternoon text DEFAULT ''::text, p_notes text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result nm_daily_meals;
BEGIN
  INSERT INTO nm_daily_meals (patient_id, professional_id, day_of_week, breakfast, lunch, dinner, snack_morning, snack_afternoon, notes)
  VALUES (p_patient_id, p_professional_id, p_day, p_breakfast, p_lunch, p_dinner, p_snack_morning, p_snack_afternoon, p_notes)
  ON CONFLICT (patient_id, day_of_week)
  DO UPDATE SET
    breakfast = EXCLUDED.breakfast,
    lunch = EXCLUDED.lunch,
    dinner = EXCLUDED.dinner,
    snack_morning = EXCLUDED.snack_morning,
    snack_afternoon = EXCLUDED.snack_afternoon,
    notes = EXCLUDED.notes,
    professional_id = EXCLUDED.professional_id,
    updated_at = now(),
    is_active = true
  RETURNING * INTO v_result;
  
  RETURN jsonb_build_object('success', true, 'id', v_result.id, 'day', v_result.day_of_week);
END;
$function$;
