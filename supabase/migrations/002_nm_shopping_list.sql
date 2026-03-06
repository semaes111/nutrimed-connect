-- ═══════════════════════════════════════════════════════════════════
-- NutriMed Connect — Shopping List Table
-- Migration: 002_nm_shopping_list.sql
-- Date: 2026-03-06
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS nm_shopping_lists (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id       UUID        NOT NULL REFERENCES nm_patients(id) ON DELETE CASCADE,
  professional_id  UUID        REFERENCES nm_professionals(id),
  diet_summary     TEXT,
  items            JSONB       NOT NULL DEFAULT '{}',
  is_current       BOOLEAN     NOT NULL DEFAULT true,
  generated_at     TIMESTAMPTZ DEFAULT now(),
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nm_shopping_patient
  ON nm_shopping_lists(patient_id, is_current, generated_at DESC);

ALTER TABLE nm_shopping_lists ENABLE ROW LEVEL SECURITY;

-- Service role: acceso total para Edge Function nm-shopping
CREATE POLICY "service_all_nm_shopping_lists"
  ON nm_shopping_lists FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Anon: acceso durante login (patrón del proyecto)
CREATE POLICY "anon_read_nm_shopping_lists"
  ON nm_shopping_lists FOR SELECT TO anon
  USING (true);

-- NOTA: la política authenticated se añade en 003_nm_shopping_rls_authenticated.sql
