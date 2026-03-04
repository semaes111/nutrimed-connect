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

/* ── Funciones de generación de plantillas de menú ──────────────────
   Usadas en MealsTab (profesional) y PatientDashboard (paciente)
   para auto-rellenar cuando nm_daily_meals no tiene datos guardados  */

export const DIET_CODE_MAP = {
  'metabolica': 'D06', 'rescate': 'D07', 'antioxidante': 'D05',
  'antiinflamatoria': 'D03', 'keto-microbiota': 'D04',
  'ig-bajo': 'D02', 'ig-medio': 'D01', 'intermedio-integral': 'D10',
  'embarazo': 'D01', 'metabolica-antioxidante': 'D06',
  'rescate-proteica': 'D07', 'rescate-proteica-v2': 'D08',
  'rescate-proteica-v3': 'D09', 'antiinflamatoria-ig-bajo': 'D03',
  'progresiva-ig-bajo': 'D02', 'progresiva-ig-medio': 'D01',
  'progresiva-intermedio-integral': 'D10',
}

export const BREAKFAST_MAP = {
  'D01': 'Completo IG Intermedio', 'D02': 'Completo IG Bajo',
  'D03': 'Acelerado IG Bajo',      'D04': 'Acelerado IG Bajo',
  'D05': 'Completo IG Bajo',       'D06': 'Acelerado IG Bajo',
  'D07': 'Acelerado Rescate',      'D08': 'Acelerado Rescate',
  'D09': 'Acelerado Rescate',      'D10': 'Completo IG Intermedio',
}

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

/** Genera el mapa de menús para todos los días usando las plantillas de dieta.
 *  Respeta los registros existentes en nm_daily_meals si tienen contenido real. */
export function buildMealsFromTemplates(plans, savedMeals, mealCatalog, bfCatalog) {
  const result = {}
  const autoFilled = {}

  DAYS_ORDER.forEach(day => {
    const saved = savedMeals[day]
    // Si hay datos reales guardados, usarlos tal cual
    if (saved && (saved.breakfast || saved.lunch || saved.dinner)) {
      result[day] = saved
      return
    }
    // Buscar el plan para este día
    const plan = plans.find(p => p.day_of_week === day) || plans.find(p => p.day_of_week === 'todos')
    if (!plan) return

    const code = plan.diet_code || DIET_CODE_MAP[plan.diet_type || ''] || ''
    if (!code) return

    const bfName = BREAKFAST_MAP[code]
    const bfRow  = bfCatalog.find(b => b.name === bfName)
    const platos = mealCatalog.filter(m => m.diet_codes && m.diet_codes.includes(code))
    const half   = Math.ceil(platos.length / 2)

    result[day] = {
      day_of_week:      day,
      breakfast:        buildBreakfastTemplate(bfRow),
      lunch:            buildLunchDinnerTemplate(platos),
      dinner:           buildLunchDinnerTemplate(platos, half),
      snack_morning:    buildSnackTemplate(code),
      snack_afternoon:  buildSnackTemplate(code),
    }
    autoFilled[day] = true
  })

  return { mealsMap: result, autoFilled }
}
