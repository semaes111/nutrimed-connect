// Maps diet slugs to visual config — DARK METALLIC theme
const DIET_CONFIG = {
  rescate:              { label: 'Rescate', icon: '🔴', color: '#FB7185', bg: 'rgba(251,113,133,0.08)', level: 7 },
  metabolica:           { label: 'Metabólica', icon: '🟣', color: '#F472B6', bg: 'rgba(244,114,182,0.08)', level: 8 },
  antioxidante:         { label: 'Antioxidante', icon: '🟪', color: '#C084FC', bg: 'rgba(192,132,252,0.08)', level: 6 },
  antiinflamatoria:     { label: 'Antiinflamatoria', icon: '🔵', color: '#818CF8', bg: 'rgba(129,140,248,0.08)', level: 5 },
  'keto-microbiota':    { label: 'Keto Microbiota', icon: '🫐', color: '#60A5FA', bg: 'rgba(96,165,250,0.08)', level: 4 },
  'ig-bajo':            { label: 'IG Bajo', icon: '🩵', color: '#22D3EE', bg: 'rgba(34,211,238,0.08)', level: 3 },
  'ig-medio':           { label: 'IG Medio', icon: '🟢', color: '#34D399', bg: 'rgba(52,211,153,0.08)', level: 2 },
  'intermedio-integral': { label: 'Intermedio', icon: '🥗', color: '#A3E635', bg: 'rgba(163,230,53,0.08)', level: 1 },
  embarazo:             { label: 'Embarazo', icon: '🤰', color: '#FDA4AF', bg: 'rgba(253,164,175,0.08)', level: 0 },
}

export function getDietConfig(slug) {
  if (!slug) return null
  const normalized = slug.toLowerCase().replace(/\s+/g, '-')
  return DIET_CONFIG[normalized] || { label: slug, icon: '📋', color: '#94A3B8', bg: 'rgba(148,163,184,0.08)', level: 0 }
}

export const DAYS_ORDER = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']

export const DAY_LABELS = {
  lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles',
  jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo', todos: 'Todos'
}

export function getTodaySlug() {
  const days = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
  return days[new Date().getDay()]
}

export function getDaysRemaining(expiryDate) {
  if (!expiryDate) return null
  const diff = new Date(expiryDate) - new Date()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateShort(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}
