-- ═══════════════════════════════════════════════════════════════
-- Fix RLS nm_shopping_lists: política authenticated
-- Patrón exacto del proyecto: authenticated ALL true
-- (igual que auth_all_daily_meals en nm_daily_meals)
-- ═══════════════════════════════════════════════════════════════

CREATE POLICY "auth_all_nm_shopping_lists"
  ON nm_shopping_lists
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
