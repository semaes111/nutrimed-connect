/**
 * src/lib/diet/utils.js
 *
 * Responsabilidad única: utilidades de fecha y día relacionadas con dietas.
 * No tiene dependencias de UI ni de Supabase.
 */

/**
 * Devuelve el slug del día actual (ej: 'lunes', 'martes'...).
 * Compatible con DAYS_ORDER de constants.js.
 */
export function getTodaySlug() {
  const days = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
  return days[new Date().getDay()]
}

/**
 * Calcula los días que quedan hasta la fecha de expiración de un código de acceso.
 * @param {string|null} expiryDate - ISO date string
 * @returns {number|null} días restantes (puede ser negativo si ya expiró), o null si no hay fecha
 */
export function getDaysRemaining(expiryDate) {
  if (!expiryDate) return null
  const diff = new Date(expiryDate) - new Date()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

/**
 * Formatea una fecha ISO a formato largo en español.
 * @param {string|null} dateStr
 * @returns {string} ej: "5 mar 2025"
 */
export function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Formatea una fecha ISO a formato corto en español (sin año).
 * @param {string|null} dateStr
 * @returns {string} ej: "5 mar"
 */
export function formatDateShort(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}
