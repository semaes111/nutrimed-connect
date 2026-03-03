-- ═══════════════════════════════════════════════════════════════════
-- NutriMed Connect — Complete Database Schema
-- Migration: 001_nm_tables.sql
-- Date: 2026-03-03
-- Tables: 15 (nm_ prefix)
-- ═══════════════════════════════════════════════════════════════════

-- ─── PROFESSIONALS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nm_professionals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  auth_user_id UUID NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  license_number TEXT,
  clinic_name TEXT DEFAULT 'NutriMed Connect',
  specialty TEXT DEFAULT 'Nutrición Clínica',
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── PATIENTS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nm_patients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id UUID NOT NULL REFERENCES nm_professionals(id),
  assigned_doctor TEXT NOT NULL,
  full_name TEXT NOT NULL,
  age INTEGER,
  height NUMERIC,
  phone TEXT,
  email TEXT,
  current_weight NUMERIC,
  initial_weight NUMERIC,
  best_weight_5_years NUMERIC,
  target_weight NUMERIC,
  has_diseases BOOLEAN DEFAULT false,
  diseases_description TEXT,
  does_exercise BOOLEAN DEFAULT false,
  family_history JSONB DEFAULT '{"pcos": false, "diabetes_type2": false, "hypothyroidism": false}',
  gynecological_problems BOOLEAN DEFAULT false,
  allergies_medications TEXT,
  food_intolerances TEXT,
  stress_level INTEGER DEFAULT 5,
  food_control_level INTEGER DEFAULT 5,
  motivation_level INTEGER DEFAULT 5,
  is_blocked BOOLEAN DEFAULT false,
  access_code TEXT,
  code_expiry TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── ACCESS CODES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nm_access_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES nm_patients(id),
  access_code TEXT NOT NULL,
  code_expiry TIMESTAMPTZ NOT NULL,
  is_blocked BOOLEAN DEFAULT false,
  patient_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── DIET CATALOG ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nm_diet_catalog (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  diet_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  glycemic_index TEXT,
  restriction_level TEXT,
  description TEXT,
  keywords TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── DIET PLANS (per patient, per day) ───────────────────────────
CREATE TABLE IF NOT EXISTS nm_diet_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES nm_patients(id),
  professional_id UUID REFERENCES nm_professionals(id),
  dieta_valida_id UUID REFERENCES nm_diet_catalog(id),
  diet_type TEXT NOT NULL,
  diet_name TEXT,
  day_of_week TEXT NOT NULL,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── DAILY MEALS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nm_daily_meals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES nm_patients(id),
  professional_id UUID NOT NULL REFERENCES nm_professionals(id),
  day_of_week TEXT NOT NULL,
  breakfast TEXT DEFAULT '',
  lunch TEXT DEFAULT '',
  dinner TEXT DEFAULT '',
  snack_morning TEXT DEFAULT '',
  snack_afternoon TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── FOOD KNOWLEDGE BASE ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nm_food_knowledge (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  subcategory TEXT,
  name TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  diet_codes TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── MEAL CATALOG ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nm_meal_catalog (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plate_code TEXT,
  diet_codes TEXT[],
  protein_type TEXT,
  name TEXT NOT NULL,
  ingredients TEXT,
  meal_time TEXT DEFAULT 'Almuerzo/Cena',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── BREAKFAST CATALOG ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nm_breakfast_catalog (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  drinks TEXT,
  bread TEXT,
  toppings TEXT,
  dairy TEXT,
  fruits TEXT,
  extras TEXT,
  restrictions TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── SNACK CATALOG ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nm_snack_catalog (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  bread TEXT,
  toppings TEXT,
  nuts TEXT,
  fruits TEXT,
  dairy TEXT,
  others TEXT,
  diet_codes TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── RECIPES ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nm_recipes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  meal_type TEXT NOT NULL,
  diet_types TEXT[] DEFAULT '{}',
  ingredients JSONB DEFAULT '[]',
  instructions TEXT,
  prep_time_minutes INTEGER,
  calories_estimate INTEGER,
  image_url TEXT,
  tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── MEDICATIONS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nm_medications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES nm_patients(id),
  medication_name TEXT NOT NULL,
  dosage TEXT,
  clicks INTEGER,
  frequency TEXT,
  start_date DATE,
  end_date DATE,
  side_effects TEXT,
  side_effects_treatment TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── WEIGHT RECORDS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nm_weight_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES nm_patients(id),
  weight NUMERIC NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  recorded_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── CHAT CONVERSATIONS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nm_chat_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES nm_patients(id),
  title TEXT DEFAULT 'Nueva conversación',
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── CHAT MESSAGES ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nm_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES nm_chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══ INDEXES ═════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_nm_patients_professional ON nm_patients(professional_id);
CREATE INDEX IF NOT EXISTS idx_nm_diet_plans_patient ON nm_diet_plans(patient_id, is_active);
CREATE INDEX IF NOT EXISTS idx_nm_daily_meals_patient ON nm_daily_meals(patient_id, is_active);
CREATE INDEX IF NOT EXISTS idx_nm_food_diet_codes ON nm_food_knowledge USING GIN (diet_codes);
CREATE INDEX IF NOT EXISTS idx_nm_meal_diet_codes ON nm_meal_catalog USING GIN (diet_codes);
CREATE INDEX IF NOT EXISTS idx_nm_medications_patient ON nm_medications(patient_id, is_active);
CREATE INDEX IF NOT EXISTS idx_nm_weight_patient_date ON nm_weight_records(patient_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_nm_chat_conv_patient ON nm_chat_conversations(patient_id, is_active);
CREATE INDEX IF NOT EXISTS idx_nm_chat_msg_conv ON nm_chat_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_nm_access_codes_patient ON nm_access_codes(patient_id);

-- ═══ RLS ═════════════════════════════════════════════════════════
ALTER TABLE nm_professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE nm_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE nm_access_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE nm_diet_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE nm_diet_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE nm_daily_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE nm_food_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE nm_meal_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE nm_breakfast_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE nm_snack_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE nm_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE nm_medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE nm_weight_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE nm_chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE nm_chat_messages ENABLE ROW LEVEL SECURITY;

-- Service role: full access (Edge Functions, backend)
DO $$ 
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'nm_professionals','nm_patients','nm_access_codes','nm_diet_catalog',
    'nm_diet_plans','nm_daily_meals','nm_food_knowledge','nm_meal_catalog',
    'nm_breakfast_catalog','nm_snack_catalog','nm_recipes','nm_medications',
    'nm_weight_records','nm_chat_conversations','nm_chat_messages'
  ]) LOOP
    EXECUTE format('CREATE POLICY IF NOT EXISTS "service_all_%s" ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- Anon: read catalogs + food knowledge (public data)
CREATE POLICY "anon_read_diet_catalog" ON nm_diet_catalog FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_food_knowledge" ON nm_food_knowledge FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_meal_catalog" ON nm_meal_catalog FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_breakfast_catalog" ON nm_breakfast_catalog FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_snack_catalog" ON nm_snack_catalog FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_recipes" ON nm_recipes FOR SELECT TO anon USING (is_active = true);

-- Anon: patient access (for PatientChat, dashboard)
CREATE POLICY "anon_read_patients" ON nm_patients FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_diet_plans" ON nm_diet_plans FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_daily_meals" ON nm_daily_meals FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_medications" ON nm_medications FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_weight_records" ON nm_weight_records FOR SELECT TO anon USING (true);
CREATE POLICY "anon_all_chat_conversations" ON nm_chat_conversations FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_chat_messages" ON nm_chat_messages FOR ALL TO anon USING (true) WITH CHECK (true);
