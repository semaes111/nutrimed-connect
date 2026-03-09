/**
 * src/lib/diet/templates.js
 *
 * Responsabilidad única: generación de plantillas de menú a partir
 * de los catálogos de dieta. Sin dependencias de UI ni de Supabase.
 *
 * Consumido por: MealsTab (profesional) y PatientDashboard (paciente).
 */

import { DAYS_ORDER, DIET_CODE_MAP, BREAKFAST_MAP } from './constants.js'

/**
 * Fallback: dietas con pocos platos en el catálogo heredan platos de una
 * dieta compatible más amplia. Solo se usa cuando platos < 8.
 * D10 (intermedio-integral) ← D01 (ig-medio, 23 platos)
 * D08/D09 (rescate-proteica) ← D07 (rescate, 9 platos)
 */
const DIET_FALLBACK = {
  'D08': 'D07',
  'D09': 'D07',
  'D10': 'D01',
}

/**
 * Construye el texto de desayuno a partir de una fila del catálogo de desayunos.
 * @param {object|null} bfRow - fila de nm_breakfast_catalog
 * @returns {string}
 */
export function buildBreakfastTemplate(bfRow) {
  if (!bfRow) return ''
  const lines = []
  if (bfRow.drinks)   lines.push(`☕ Bebidas: ${bfRow.drinks}`)
  if (bfRow.bread)    lines.push(`🍞 Pan: ${bfRow.bread}`)
  if (bfRow.toppings) lines.push(`🧀 Complementos tostada:\n   ${bfRow.toppings}`)
  if (bfRow.dairy)    lines.push(`🥛 Lácteos: ${bfRow.dairy}`)
  if (bfRow.fruits)   lines.push(`🍎 Frutas: ${bfRow.fruits}`)
  if (bfRow.extras)   lines.push(`➕ Opciones extra:\n   ${bfRow.extras}`)
  return `═══ BASE FIJA ═══\n${lines.join('\n')}`
}

/**
 * Construye el texto de comida/cena con hasta 4 opciones rotadas.
 * @param {object[]} platos   - array de platos del catálogo
 * @param {number}   offset   - desplazamiento para rotar las opciones (cena usa la mitad)
 * @returns {string}
 */
export function buildLunchDinnerTemplate(platos, offset = 0) {
  if (!platos || platos.length === 0) return ''
  const rotated = [...platos.slice(offset), ...platos.slice(0, offset)]
  const options  = rotated.slice(0, 4)
  const labels   = ['OPCIÓN A', 'OPCIÓN B', 'OPCIÓN C', 'OPCIÓN D']
  return options.map((p, i) => {
    const ing = p.ingredients || p.ingredientes_principales || ''
    const txt = ing ? `🍽️ ${p.name || p.nombre_plato}\n   ${ing}` : `🍽️ ${p.name || p.nombre_plato}`
    return `═══ ${labels[i]} ═══\n${txt}`
  }).join('\n\n')
}

/**
 * Construye el texto de snack para un código de dieta dado.
 * @param {string} code - código de dieta (ej: 'D01', 'D07')
 * @returns {string}
 */
export function buildSnackTemplate(code) {
  const map = {
    'D01': '🍎 Fruta de temporada (manzana, pera, naranja, kiwi)\n🥛 Yogur natural sin azúcar + 1 puñado frutos secos\n🧀 Quesito + 3-4 nueces',
    'D02': '🍎 Fruta baja en IG (fresas, arándanos, kiwi, manzana)\n🥛 Yogur natural sin azúcar + semillas chía\n🥑 1/4 aguacate con limón',
    'D03': '🍎 Fruta: manzana, kiwi o frutos rojos\n🥛 Yogur natural sin azúcar\n🥚 Huevo duro + pepino',
    'D04': '🥑 1/4 aguacate + nueces\n🧀 Queso curado + jamón serrano\n🥚 Huevo duro + aceitunas',
    'D05': '🍇 Frutos rojos (arándanos, frambuesas, fresas)\n🥛 Yogur natural + semillas\n🥜 Almendras crudas (20g)',
    'D06': '🥑 1/4 aguacate\n🥚 Huevo duro\n🧀 Queso fresco + pepino',
    'D07': '🥛 Yogur natural sin azúcar\n🍎 Kiwi o piña x2\n🥚 Huevo duro',
    'D08': '🥛 Yogur natural sin azúcar\n🥚 Huevo duro\n🥒 Pepino + 3 nueces',
    'D09': '🥛 Yogur natural sin azúcar\n🥚 Huevo duro',
    'D10': '🍎 Fruta integral (manzana, pera, naranja)\n🥛 Yogur natural + 1 cdta chía\n🥜 Almendras (20g) + fruta',
  }
  return map[code] || '🍎 Fruta de temporada\n🥛 Yogur natural sin azúcar\n🥜 Puñado de frutos secos (20g)'
}

/**
 * Genera el mapa completo de menús para todos los días de la semana.
 * Respeta los registros existentes en nm_daily_meals si tienen contenido real.
 * Para los días sin datos guardados, auto-rellena desde las plantillas de dieta.
 *
 * @param {object[]} plans       - nm_diet_plans activos del paciente
 * @param {object}   savedMeals  - { [day_of_week]: nm_daily_meals row }
 * @param {object[]} mealCatalog - nm_meal_catalog completo
 * @param {object[]} bfCatalog   - nm_breakfast_catalog completo
 * @returns {{ mealsMap: object, autoFilled: object }}
 */
export function buildMealsFromTemplates(plans, savedMeals, mealCatalog, bfCatalog) {
  const result     = {}
  const autoFilled = {}

  DAYS_ORDER.forEach((day, dayIndex) => {
    const saved = savedMeals[day]
    // Si hay datos reales guardados, usarlos tal cual
    if (saved && (saved.breakfast || saved.lunch || saved.dinner)) {
      result[day] = saved
      return
    }

    // Buscar el plan para este día (primero día específico, luego el plan base 'todos')
    const plan = plans.find(p => p.day_of_week === day) || plans.find(p => p.day_of_week === 'todos')
    if (!plan) return

    const code   = plan.diet_code || DIET_CODE_MAP[plan.diet_type || ''] || ''
    if (!code) return

    const bfName = BREAKFAST_MAP[code]
    const bfRow  = bfCatalog.find(b => b.name === bfName)
    let platos   = mealCatalog.filter(m => m.diet_codes && m.diet_codes.includes(code))
    // Fallback: si el catálogo tiene < 8 platos, complementar con dieta compatible
    if (platos.length < 8) {
      const fallback = DIET_FALLBACK[code]
      if (fallback) {
        const extras = mealCatalog.filter(m =>
          m.diet_codes && m.diet_codes.includes(fallback) && !platos.some(p => p.id === m.id)
        )
        platos = [...platos, ...extras]
      }
    }
    const half      = Math.ceil(platos.length / 2)
    // Rotación por día: cada día avanza 4 posiciones (nº de opciones mostradas)
    const lunchOff  = platos.length > 1 ? (dayIndex * 4) % platos.length : 0
    const dinnerOff = platos.length > 1 ? (lunchOff + half) % platos.length : 0

    result[day] = {
      day_of_week:     day,
      breakfast:       buildBreakfastTemplate(bfRow),
      lunch:           buildLunchDinnerTemplate(platos, lunchOff),
      dinner:          buildLunchDinnerTemplate(platos, dinnerOff),
      snack_morning:   buildSnackTemplate(code),
      snack_afternoon: buildSnackTemplate(code),
    }
    autoFilled[day] = true
  })

  return { mealsMap: result, autoFilled }
}
