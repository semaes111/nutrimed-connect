/**
 * src/lib/diet/constants.js
 *
 * Responsabilidad única: definiciones estáticas de configuración de dietas.
 * - Configuración visual (colores, iconos, labels)
 * - Mapas de días
 * - Mapas de códigos de dieta (slugs → códigos BD)
 * - Mapas de desayunos por código
 */

// Maps diet slugs → visual config (dark metallic theme)
export const DIET_CONFIG = {
  rescate:               { label: 'Rescate',              icon: '🔴', color: '#FB7185', bg: 'rgba(251,113,133,0.08)', level: 7 },
  metabolica:            { label: 'Metabólica',           icon: '🟣', color: '#F472B6', bg: 'rgba(244,114,182,0.08)', level: 8 },
  antioxidante:          { label: 'Antioxidante',         icon: '🟪', color: '#C084FC', bg: 'rgba(192,132,252,0.08)', level: 6 },
  antiinflamatoria:      { label: 'Antiinflamatoria',     icon: '🔵', color: '#818CF8', bg: 'rgba(129,140,248,0.08)', level: 5 },
  'keto-microbiota':     { label: 'Keto Microbiota',      icon: '🫐', color: '#60A5FA', bg: 'rgba(96,165,250,0.08)',  level: 4 },
  'ig-bajo':             { label: 'IG Bajo',              icon: '🩵', color: '#22D3EE', bg: 'rgba(34,211,238,0.08)', level: 3 },
  'ig-medio':            { label: 'IG Medio',             icon: '🟢', color: '#34D399', bg: 'rgba(52,211,153,0.08)', level: 2 },
  'intermedio-integral': { label: 'Intermedio',           icon: '🥗', color: '#A3E635', bg: 'rgba(163,230,53,0.08)', level: 1 },
  embarazo:              { label: 'Embarazo',             icon: '🤰', color: '#FDA4AF', bg: 'rgba(253,164,175,0.08)', level: 0 },
}

/** Devuelve la config visual para un slug de dieta.
 * Si no existe el slug exacto, devuelve un fallback genérico. */
export function getDietConfig(slug) {
  if (!slug) return null
  const normalized = slug.toLowerCase().replace(/\s+/g, '-')
  return DIET_CONFIG[normalized] || { label: slug, icon: '📋', color: '#94A3B8', bg: 'rgba(148,163,184,0.08)', level: 0 }
}

/** Orden canónico de los días de la semana */
export const DAYS_ORDER = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']

/** Labels de visualización para cada slug de día */
export const DAY_LABELS = {
  lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles',
  jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo', todos: 'Todos',
}

/** Mapeo slug de dieta → código interno de BD (usado para referencias de plantillas) */
export const DIET_CODE_MAP = {
  'metabolica': 'D06',             'rescate': 'D07',
  'antioxidante': 'D05',           'antiinflamatoria': 'D03',
  'keto-microbiota': 'D04',        'ig-bajo': 'D02',
  'ig-medio': 'D01',               'intermedio-integral': 'D10',
  'embarazo': 'D01',               'metabolica-antioxidante': 'D06',
  'rescate-proteica': 'D07',       'rescate-proteica-v2': 'D08',
  'rescate-proteica-v3': 'D09',    'antiinflamatoria-ig-bajo': 'D03',
  'progresiva-ig-bajo': 'D02',     'progresiva-ig-medio': 'D01',
  'progresiva-intermedio-integral': 'D10',
}

/** Mapeo código dieta → nombre de desayuno base correspondiente */
export const BREAKFAST_MAP = {
  'D01': 'Completo IG Intermedio', 'D02': 'Completo IG Bajo',
  'D03': 'Acelerado IG Bajo',      'D04': 'Acelerado IG Bajo',
  'D05': 'Completo IG Bajo',       'D06': 'Acelerado IG Bajo',
  'D07': 'Acelerado Rescate',      'D08': 'Acelerado Rescate',
  'D09': 'Acelerado Rescate',      'D10': 'Completo IG Intermedio',
}
