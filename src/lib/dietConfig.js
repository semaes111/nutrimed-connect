/**
 * src/lib/dietConfig.js
 *
 * BARREL RE-EXPORT — Compatibilidad hacia atrás.
 *
 * Este archivo re-exporta todo desde los módulos especializados en src/lib/diet/.
 * TODOS los imports existentes en el proyecto siguen funcionando sin cambios.
 *
 * Módulos internos:
 *   src/lib/diet/constants.js  — DIET_CONFIG, getDietConfig, DAYS_ORDER, DAY_LABELS,
 *                                DIET_CODE_MAP, BREAKFAST_MAP, SHOPPING_CATEGORIES
 *   src/lib/diet/utils.js      — getTodaySlug, getDaysRemaining, formatDate, formatDateShort
 *   src/lib/diet/templates.js  — buildBreakfastTemplate, buildLunchDinnerTemplate,
 *                                buildSnackTemplate, buildSnackFromCatalog,
 *                                buildMealsFromTemplates
 */

export { DIET_CONFIG, getDietConfig, DAYS_ORDER, DAY_LABELS, DIET_CODE_MAP, BREAKFAST_MAP, SHOPPING_CATEGORIES } from './diet/constants.js'
export { getTodaySlug, getDaysRemaining, formatDate, formatDateShort } from './diet/utils.js'
export { buildBreakfastTemplate, buildLunchDinnerTemplate, buildSnackTemplate, buildSnackFromCatalog, buildMealsFromTemplates } from './diet/templates.js'
