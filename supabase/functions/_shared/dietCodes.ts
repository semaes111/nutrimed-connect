// _shared/dietCodes.ts — Fuente única del mapa diet_type → diet_code para las Edge Functions.
// DEBE permanecer sincronizado byte a byte con src/lib/diet/constants.js (frontend).
// Guard automático: scripts/check-dietmap.mjs (npm run check:dietmap, CI).
export const DIET_CODE_MAP: Record<string, string> = {
  'metabolica': 'D06', 'rescate': 'D07', 'antioxidante': 'D05',
  'antiinflamatoria': 'D03', 'keto-microbiota': 'D04',
  'ig-bajo': 'D02', 'ig-medio': 'D01', 'intermedio-integral': 'D10',
  'embarazo': 'D01', 'metabolica-antioxidante': 'D06',
  'rescate-proteica': 'D07', 'rescate-proteica-v2': 'D08',
  'rescate-proteica-v3': 'D09', 'antiinflamatoria-ig-bajo': 'D03',
  'progresiva-ig-bajo': 'D02', 'progresiva-ig-medio': 'D01',
  'progresiva-intermedio-integral': 'D10',
}
