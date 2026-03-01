// Maps diet slugs to visual config
const DIET_CONFIG = {
  rescate:              { label: 'Rescate', icon: '🔴', color: '#E11D48', bg: '#FFF1F2', level: 7 },
  metabolica:           { label: 'Metabólica', icon: '🟣', color: '#DB2777', bg: '#FDF2F8', level: 8 },
  antioxidante:         { label: 'Antioxidante', icon: '🟪', color: '#9333EA', bg: '#FAF5FF', level: 6 },
  antiinflamatoria:     { label: 'Antiinflamatoria', icon: '🔵', color: '#6366F1', bg: '#EEF2FF', level: 5 },
  'keto-microbiota':    { label: 'Keto Microbiota', icon: '🫐', color: '#2563EB', bg: '#EFF6FF', level: 4 },
  'ig-bajo':            { label: 'IG Bajo', icon: '🩵', color: '#0891B2', bg: '#ECFEFF', level: 3 },
  'ig-medio':           { label: 'IG Medio', icon: '🟢', color: '#059669', bg: '#ECFDF5', level: 2 },
  'intermedio-integral': { label: 'Intermedio', icon: '🥗', color: '#65A30D', bg: '#F7FEE7', level: 1 },
  embarazo:             { label: 'Embarazo', icon: '🤰', color: '#EC4899', bg: '#FDF2F8', level: 0 },
}

export function getDietConfig(slug) {
  if (!slug) return null
  const normalized = slug.toLowerCase().replace(/\s+/g, '-')
  return DIET_CONFIG[normalized] || { label: slug, icon: '📋', color: '#64748B', bg: '#F8FAFC', level: 0 }
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
