import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { DAYS_ORDER, DAY_LABELS, getDietConfig } from '../../lib/dietConfig'
import { UtensilsCrossed, Coffee, Sun, Moon, Cookie, Save, Check, ChevronDown, ChevronUp, Sparkles, Loader2, Wand2 } from 'lucide-react'

const MEAL_ICONS = {
  breakfast: Coffee,
  lunch: Sun,
  dinner: Moon,
  snack_morning: Cookie,
  snack_afternoon: Cookie,
}

const MEAL_LABELS = {
  breakfast: 'Desayuno',
  lunch: 'Comida',
  dinner: 'Cena',
  snack_morning: 'Media mañana',
  snack_afternoon: 'Merienda',
}

/* ── Mapeo diet_code → nombre en nm_breakfast_catalog ───────────── */
const BREAKFAST_CATALOG_MAP = {
  'D01': 'Completo IG Intermedio',
  'D02': 'Completo IG Bajo',
  'D03': 'Acelerado IG Bajo',
  'D04': 'Acelerado IG Bajo',
  'D05': 'Completo IG Bajo',
  'D06': 'Acelerado IG Bajo',
  'D07': 'Acelerado Rescate',
  'D08': 'Acelerado Rescate',
  'D09': 'Acelerado Rescate',
  'D10': 'Completo IG Intermedio',
}

/* ── Generadores de plantillas ───────────────────────────────────── */
function generateBreakfastTemplate(bfRow) {
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

function generateLunchDinnerTemplate(platos) {
  if (!platos || platos.length === 0) return ''
  const options = platos.slice(0, 4)
  const labels = ['OPCIÓN A', 'OPCIÓN B', 'OPCIÓN C', 'OPCIÓN D']
  return options.map((p, i) => {
    const text = p.ingredients ? `🍽️ ${p.name}\n   ${p.ingredients}` : `🍽️ ${p.name}`
    return `═══ ${labels[i]} ═══\n${text}`
  }).join('\n\n')
}

function generateSnackTemplate(dietCode, bfRow) {
  // Snacks basados en el tipo de dieta
  const snacksByCode = {
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
  return snacksByCode[dietCode] || '🍎 Fruta de temporada\n🥛 Yogur natural sin azúcar\n🥜 Puñado de frutos secos (20g)'
}

function buildDietCodeMap() {
  return {
    'metabolica': 'D06', 'rescate': 'D07', 'antioxidante': 'D05',
    'antiinflamatoria': 'D03', 'keto-microbiota': 'D04',
    'ig-bajo': 'D02', 'ig-medio': 'D01', 'intermedio-integral': 'D10',
    'embarazo': 'D01', 'metabolica-antioxidante': 'D06',
    'rescate-proteica': 'D07', 'rescate-proteica-v2': 'D08',
    'rescate-proteica-v3': 'D09', 'antiinflamatoria-ig-bajo': 'D03',
    'progresiva-ig-bajo': 'D02', 'progresiva-ig-medio': 'D01',
    'progresiva-intermedio-integral': 'D10',
  }
}

export default function MealsTab({ patient, professionalId }) {
  const [meals, setMeals] = useState({})
  const [dietPlans, setDietPlans] = useState([])
  const [mealCatalog, setMealCatalog] = useState([])
  const [breakfastCatalog, setBreakfastCatalog] = useState([])
  const [expandedDay, setExpandedDay] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [saving, setSaving] = useState(null)
  const [saved, setSaved] = useState({})
  const [autoFilled, setAutoFilled] = useState({})
  const [suggestingFor, setSuggestingFor] = useState(null)

  const loadAll = useCallback(async () => {
    if (!patient?.id) return
    setLoading(true)
    setLoadError(null)
    const [mealsRes, plansRes, mealCatRes, bfastRes] = await Promise.all([
      supabase.from('nm_daily_meals').select('*').eq('patient_id', patient.id).eq('is_active', true),
      supabase.from('nm_diet_plans').select('*').eq('patient_id', patient.id).eq('is_active', true),
      supabase.from('nm_meal_catalog').select('*').order('name'),
      supabase.from('nm_breakfast_catalog').select('*'),
    ])
    if (mealsRes.error || plansRes.error || mealCatRes.error || bfastRes.error) {
      const err = mealsRes.error || plansRes.error || mealCatRes.error || bfastRes.error
      setLoadError(err.message || 'Error al cargar datos')
      setLoading(false)
      return
    }
    const plans     = plansRes.data   || []
    const catalog   = mealCatRes.data || []
    const bfCatalog = bfastRes.data   || []
    const dietCodeMap = buildDietCodeMap()

    /* ── Construir mealsMap desde BD ─────────────────────────────── */
    const savedMealsMap = {}
    ;(mealsRes.data || []).forEach(m => { savedMealsMap[m.day_of_week] = m })

    /* ── Auto-fill para días SIN datos guardados ─────────────────── */
    const autoFillMap = {}
    const mealsMap = { ...savedMealsMap }

    DAYS_ORDER.forEach(day => {
      if (savedMealsMap[day]) return // ya tiene datos → no tocar

      // Obtener el plan para este día
      const plan = plans.find(p => p.day_of_week === day) || plans.find(p => p.day_of_week === 'todos')
      if (!plan) return // sin dieta asignada

      const code = plan.diet_code || dietCodeMap[plan.diet_type || ''] || ''
      if (!code) return

      // Generar breakfast template
      const bfName = BREAKFAST_CATALOG_MAP[code]
      const bfRow  = bfCatalog.find(b => b.name === bfName)
      const breakfast = generateBreakfastTemplate(bfRow)

      // Generar lunch/dinner templates desde nm_meal_catalog
      const platos = catalog.filter(m => m.diet_codes && m.diet_codes.includes(code))
      const lunch  = generateLunchDinnerTemplate(platos)
      const dinner = generateLunchDinnerTemplate(
        // Rotar platos para cena (distintos de comida)
        [...platos.slice(Math.ceil(platos.length / 2)), ...platos.slice(0, Math.ceil(platos.length / 2))]
      )

      // Snacks desde plantillas
      const snack = generateSnackTemplate(code, bfRow)

      mealsMap[day] = { day_of_week: day, breakfast, lunch, dinner, snack_morning: snack, snack_afternoon: snack }
      autoFillMap[day] = true // marcar como auto-generado (sin guardar)
    })

    setMeals(mealsMap)
    setAutoFilled(autoFillMap)
    setDietPlans(plans)
    setMealCatalog(catalog)
    setBreakfastCatalog(bfCatalog)
    setLoading(false)
  }, [patient?.id])

  useEffect(() => { loadAll() }, [loadAll])

  function getDietForDay(day) {
    const specific = dietPlans.find(p => p.day_of_week === day)
    if (specific) return specific
    return dietPlans.find(p => p.day_of_week === 'todos')
  }

  function getMealSuggestions(day, mealType) {
    const plan = getDietForDay(day)
    if (!plan) return []
    // Usar diet_code directamente (columna añadida en migración v12)
    // Fallback al mapeo — slugs canónicos de dietas_validas (fuente de verdad)
    const dietCodeMap = {
      // Slugs canónicos actuales en dietas_validas:
      'metabolica':         'D06',
      'rescate':            'D07',
      'antioxidante':       'D05',
      'antiinflamatoria':   'D03',
      'keto-microbiota':    'D04',
      'ig-bajo':            'D02',
      'ig-medio':           'D01',
      'intermedio-integral':'D10',
      'embarazo':           'D01', // dieta embarazo → catálogo más permisivo (D01)
      // Aliases legacy (compatibilidad hacia atrás):
      'metabolica-antioxidante':       'D06',
      'rescate-proteica':              'D07',
      'rescate-proteica-v2':           'D08',
      'rescate-proteica-v3':           'D09',
      'antiinflamatoria-ig-bajo':      'D03',
      'progresiva-ig-bajo':            'D02',
      'progresiva-ig-medio':           'D01',
      'progresiva-intermedio-integral':'D10',
    }
    const code = plan.diet_code || dietCodeMap[plan.diet_type || ''] || ''
    if (mealType === 'breakfast') {
      return breakfastCatalog.map(b => ({
        id: b.id,
        label: b.name,
        text: formatBreakfast(b),
      }))
    }
    return mealCatalog
      .filter(m => m.diet_codes && m.diet_codes.includes(code))
      .map(m => ({
        id: m.id,
        label: m.name,
        text: m.ingredients ? `${m.name}: ${m.ingredients}` : m.name,
      }))
  }

  function formatBreakfast(b) {
    const parts = []
    if (b.drinks) parts.push(`☕ Bebidas: ${b.drinks.substring(0, 120)}...`)
    if (b.bread) parts.push(`🍞 Pan: ${b.bread}`)
    if (b.toppings) parts.push(`🧀 Complementos: ${b.toppings.substring(0, 120)}...`)
    if (b.dairy) parts.push(`🥛 Lácteos: ${b.dairy}`)
    if (b.fruits) parts.push(`🍎 Frutas: ${b.fruits.substring(0, 120)}...`)
    if (b.extras) parts.push(`➕ Extras: ${b.extras.substring(0, 100)}...`)
    return parts.join('\n')
  }

  function updateMealField(day, field, value) {
    setMeals(prev => ({
      ...prev,
      [day]: { ...(prev[day] || {}), day_of_week: day, [field]: value },
    }))
    if (saved[day]) setSaved(prev => ({ ...prev, [day]: false }))
  }

  async function saveDay(day) {
    setSaving(day)
    const m = meals[day] || {}
    const { error } = await supabase.rpc('upsert_daily_meal', {
      p_patient_id: patient.id,
      p_professional_id: professionalId,
      p_day: day,
      p_breakfast: m.breakfast || '',
      p_lunch: m.lunch || '',
      p_dinner: m.dinner || '',
      p_snack_morning: m.snack_morning || '',
      p_snack_afternoon: m.snack_afternoon || '',
      p_notes: m.notes || '',
    })
    setSaving(null)
    if (!error) {
      // Quitar del autoFilled — ahora está persistido en BD
      setAutoFilled(prev => { const n = { ...prev }; delete n[day]; return n })
      setSaved(prev => ({ ...prev, [day]: true }))
      setTimeout(() => setSaved(prev => ({ ...prev, [day]: false })), 2500)
    }
  }

  async function copyToAllDays(sourceDay) {
    const src = meals[sourceDay]
    if (!src) return
    setSaving('all')
    for (const day of DAYS_ORDER) {
      if (day === sourceDay) continue
      await supabase.rpc('upsert_daily_meal', {
        p_patient_id: patient.id,
        p_professional_id: professionalId,
        p_day: day,
        p_breakfast: src.breakfast || '',
        p_lunch: src.lunch || '',
        p_dinner: src.dinner || '',
        p_snack_morning: src.snack_morning || '',
        p_snack_afternoon: src.snack_afternoon || '',
        p_notes: src.notes || '',
      })
    }
    setSaving(null)
    await loadAll()
  }

  // Solo días con datos GUARDADOS en BD (no auto-fill pendiente)
  const savedDays = DAYS_ORDER.filter(d => {
    const m = meals[d]
    return m && (m.breakfast || m.lunch || m.dinner) && !autoFilled[d]
  })
  // Días con datos (guardados o auto-fill)
  const filledDays = DAYS_ORDER.filter(d => {
    const m = meals[d]
    return m && (m.breakfast || m.lunch || m.dinner)
  })

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <UtensilsCrossed size={14} className="text-[var(--color-brand)]" />
          Menús semanales — {savedDays.length}/7 días guardados
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-10">
          <Loader2 size={22} className="animate-spin text-[var(--color-brand)]" />
        </div>
      )}

      {/* Error */}
      {!loading && loadError && (
        <div className="card !p-3 bg-red-50 border border-red-200">
          <p className="text-xs text-red-700 font-medium">⚠️ Error cargando datos: {loadError}</p>
          <button onClick={loadAll} className="text-xs text-red-600 underline mt-1">Reintentar</button>
        </div>
      )}

      {/* Sin dieta asignada */}
      {!loading && !loadError && dietPlans.length === 0 && (
        <div className="card !p-4 bg-amber-50 border border-amber-200 text-center">
          <p className="text-sm font-semibold text-amber-800 mb-1">Sin dieta base asignada</p>
          <p className="text-xs text-amber-600">
            Este paciente aún no tiene una dieta asignada. Ve a la pestaña{' '}
            <strong>Dietas</strong> para asignar un plan nutricional primero.
          </p>
        </div>
      )}

      {/* Info auto-fill — menús pre-cargados desde plantilla de dieta */}
      {!loading && !loadError && dietPlans.length > 0 && Object.keys(autoFilled).length > 0 && (
        <div className="card !p-3 bg-teal-50 border border-teal-200">
          <p className="text-xs text-teal-700 flex items-center gap-1.5">
            <Wand2 size={12} className="text-teal-500 shrink-0" />
            <span>
              <strong>Menús pre-cargados</strong> automáticamente desde la plantilla de la dieta asignada.
              Revisa cada día, ajusta lo que necesites y pulsa <strong>Guardar</strong> para confirmar.
            </span>
          </p>
        </div>
      )}

      {/* Day cards */}
      {!loading && !loadError && dietPlans.length > 0 && DAYS_ORDER.map(day => {
        const m = meals[day] || {}
        const plan = getDietForDay(day)
        const cfg = plan ? getDietConfig(plan.diet_type) : null
        const isExpanded = expandedDay === day
        const hasMeals = m.breakfast || m.lunch || m.dinner
        const isSaving = saving === day || saving === 'all'
        const isSaved = saved[day]
        const isAutoFilled = autoFilled[day]

        return (
          <div key={day} className="card overflow-hidden" style={cfg ? { borderLeft: `3px solid ${cfg.color}` } : {}}>
            {/* Day header - clickable */}
            <button
              onClick={() => setExpandedDay(isExpanded ? null : day)}
              className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
                  style={cfg ? { background: cfg.bg, color: cfg.color } : { background: '#F3F4F6', color: '#9CA3AF' }}>
                  {DAY_LABELS[day]?.charAt(0)}
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-900">{DAY_LABELS[day]}</p>
                  {cfg && <p className="text-[10px]" style={{ color: cfg.color }}>{cfg.icon} {plan.diet_name || cfg.label}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {hasMeals && !isAutoFilled && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-medium">
                    ✓ Guardado
                  </span>
                )}
                {isAutoFilled && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-50 text-teal-600 font-medium flex items-center gap-1">
                    <Wand2 size={9} /> Pre-cargado
                  </span>
                )}
                {!hasMeals && !isAutoFilled && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 font-medium">
                    Sin menú
                  </span>
                )}
                {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
              </div>
            </button>

            {/* Expanded meal editor */}
            {isExpanded && (
              <div className="border-t px-3 pb-3 pt-2 space-y-3">
                {/* Banner auto-fill dentro del día expandido */}
                {isAutoFilled && (
                  <div className="rounded-lg bg-teal-50 border border-teal-200 px-3 py-2">
                    <p className="text-[11px] text-teal-700">
                      ✨ Menú generado desde la plantilla <strong>{plan.diet_name || plan.diet_type}</strong>. Edita libremente y pulsa <strong>Guardar día</strong>.
                    </p>
                  </div>
                )}

                {['breakfast', 'lunch', 'dinner', 'snack_morning', 'snack_afternoon'].map(mealType => {
                  const Icon = MEAL_ICONS[mealType]
                  const suggestions = getMealSuggestions(day, mealType)
                  const showSuggestions = suggestingFor === `${day}-${mealType}`
                  const rowCount = mealType === 'breakfast' ? 6 : mealType === 'lunch' || mealType === 'dinner' ? 5 : 3

                  return (
                    <div key={mealType}>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                          <Icon size={12} />
                          {MEAL_LABELS[mealType]}
                        </label>
                        {suggestions.length > 0 && (
                          <button
                            onClick={() => setSuggestingFor(showSuggestions ? null : `${day}-${mealType}`)}
                            className="text-[10px] text-[var(--color-brand)] hover:underline flex items-center gap-1"
                          >
                            <Sparkles size={10} />
                            {showSuggestions ? 'Ocultar' : 'Sugerencias'}
                          </button>
                        )}
                      </div>
                      <textarea
                        value={m[mealType] || ''}
                        onChange={e => updateMealField(day, mealType, e.target.value)}
                        placeholder={`Describe el ${MEAL_LABELS[mealType].toLowerCase()} del ${DAY_LABELS[day].toLowerCase()}...`}
                        className="w-full text-sm border border-gray-200 rounded-lg p-2.5 resize-none focus:ring-1 focus:ring-[var(--color-brand)] focus:border-[var(--color-brand)] transition placeholder:text-gray-300"
                        rows={rowCount}
                      />
                      {/* Suggestions dropdown */}
                      {showSuggestions && suggestions.length > 0 && (
                        <div className="mt-1 max-h-40 overflow-y-auto border rounded-lg bg-white shadow-sm divide-y">
                          {suggestions.map(s => (
                            <button key={s.id}
                              onClick={() => {
                                updateMealField(day, mealType, s.text)
                                setSuggestingFor(null)
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-teal-50 transition text-xs text-gray-700 leading-relaxed"
                            >
                              <span className="font-medium text-gray-900">{s.label}</span>
                              {s.text !== s.label && (
                                <span className="block text-gray-400 mt-0.5 line-clamp-2">{s.text}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Notes */}
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Notas</label>
                  <input
                    type="text"
                    value={m.notes || ''}
                    onChange={e => updateMealField(day, 'notes', e.target.value)}
                    placeholder="Notas del día (opcional)..."
                    className="w-full text-sm border border-gray-200 rounded-lg p-2 mt-1 focus:ring-1 focus:ring-[var(--color-brand)]"
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => saveDay(day)}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white transition"
                    style={{ background: isSaved ? '#10B981' : 'var(--color-brand)' }}
                  >
                    {isSaving ? <Loader2 size={12} className="animate-spin" /> : isSaved ? <Check size={12} /> : <Save size={12} />}
                    {isSaving ? 'Guardando...' : isSaved ? '¡Guardado!' : 'Guardar día'}
                  </button>
                  {hasMeals && (
                    <button
                      onClick={() => {
                        if (confirm(`¿Copiar el menú del ${DAY_LABELS[day]} a TODOS los demás días?`)) copyToAllDays(day)
                      }}
                      className="text-[11px] text-gray-400 hover:text-[var(--color-brand)] transition"
                    >
                      Copiar a todos los días
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
