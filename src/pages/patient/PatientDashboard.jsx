import { useState, useEffect } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'
import { getDietConfig, DAYS_ORDER, DAY_LABELS, getTodaySlug, getDaysRemaining } from '../../lib/dietConfig'
import PatientLayout from '../../components/layout/PatientLayout'
import { Scale, Pill, Calendar, Clock, TrendingDown, TrendingUp, Coffee, Sun, Moon, Cookie, ChevronDown, ChevronUp } from 'lucide-react'

const MEAL_CONFIG = {
  breakfast:       { icon: Coffee, label: 'Desayuno',      color: '#F59E0B', bg: '#FFFBEB' },
  lunch:           { icon: Sun,    label: 'Comida',        color: '#F97316', bg: '#FFF7ED' },
  dinner:          { icon: Moon,   label: 'Cena',          color: '#6366F1', bg: '#EEF2FF' },
  snack_morning:   { icon: Cookie, label: 'Media mañana',  color: '#EC4899', bg: '#FDF2F8' },
  snack_afternoon: { icon: Cookie, label: 'Merienda',      color: '#EC4899', bg: '#FDF2F8' },
}

// Section badges for parsed meal sections
const SECTION_STYLE = {
  'BASE FIJA':            { badge: '🔒 Base fija', bg: '#F0F9FF', border: '#BAE6FD', text: '#0369A1' },
  'OPCIONES VARIABLES':   { badge: '✨ Elige una opción', bg: '#FDF4FF', border: '#E9D5FF', text: '#7C3AED' },
  'OPCIÓN A':             { badge: 'Opción A', bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D' },
  'OPCIÓN B':             { badge: 'Opción B', bg: '#FFFBEB', border: '#FDE68A', text: '#A16207' },
  'OPCIÓN C':             { badge: 'Opción C', bg: '#FFF1F2', border: '#FECDD3', text: '#BE123C' },
  'OPCIÓN D':             { badge: 'Opción D', bg: '#F0F9FF', border: '#BAE6FD', text: '#0369A1' },
  'OPCIÓN E':             { badge: 'Opción E', bg: '#F5F3FF', border: '#DDD6FE', text: '#6D28D9' },
}

/** Parse structured meal text into visual sections — safe split-based parser */
function MealContent({ text, compact = false }) {
  if (!text) return null

  try {
    // Check if text has section markers
    if (!text.includes('═══')) {
      return <p className={`${compact ? 'text-[12px]' : 'text-[13px]'} text-gray-700 leading-relaxed whitespace-pre-line`}>{text}</p>
    }

    // Safe parsing: split by ═══ markers instead of fragile regex.exec() loop
    const parts = text.split('═══')
    const sections = []

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim()
      if (!part) continue

      // Check if next part is a section body (odd indices are titles, even are content after split)
      // Pattern: content ═══ TITLE ═══ content ═══ TITLE ═══ content
      // After split: ["content", " TITLE ", " content ", " TITLE ", " content"]
      // Odd-indexed parts (1, 3, 5...) are titles
      if (i % 2 === 1) {
        // This is a title — get its content from the next part
        const title = part.trim()
        const content = (i + 1 < parts.length) ? parts[i + 1].trim() : ''
        sections.push({ title, content })
      } else if (i === 0 && part) {
        // Content before first header
        sections.push({ title: null, content: part })
      }
    }

    if (sections.length === 0) {
      return <p className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-line">{text}</p>
    }

    return (
      <div className={`space-y-2 ${compact ? 'text-[11px]' : 'text-[12px]'}`}>
        {sections.map((s, i) => {
          const style = s.title ? SECTION_STYLE[s.title] : null

          if (!style) {
            return s.content ? <p key={i} className="text-gray-600 leading-relaxed whitespace-pre-line">{s.content}</p> : null
          }

          return (
            <div key={i} className="rounded-lg overflow-hidden" style={{ background: style.bg, border: `1px solid ${style.border}` }}>
              <div className="px-2.5 py-1" style={{ borderBottom: `1px solid ${style.border}` }}>
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: style.text }}>
                  {style.badge}
                </span>
              </div>
              <div className="px-2.5 py-2">
                <p className="text-gray-700 leading-relaxed whitespace-pre-line">{s.content}</p>
              </div>
            </div>
          )
        })}
      </div>
    )
  } catch (err) {
    // Fallback: render raw text if parsing fails
    return <p className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-line">{text}</p>
  }
}

export default function PatientDashboard() {
  const { profile } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedDay, setExpandedDay] = useState(null)

  useEffect(() => {
    if (!profile?.id) return
    loadDashboard()
  }, [profile?.id])

  async function loadDashboard() {
    try {
      setLoading(true)
      setError(null)
      const pid = profile.id
      const [plansRes, weightsRes, medsRes, mealsRes] = await Promise.all([
        supabase.from('nm_diet_plans').select('*').eq('patient_id', pid).eq('is_active', true),
        supabase.from('nm_weight_records').select('*').eq('patient_id', pid).order('date', { ascending: false }).limit(10),
        supabase.from('nm_medications').select('*').eq('patient_id', pid).eq('is_active', true),
        supabase.from('nm_daily_meals').select('*').eq('patient_id', pid).eq('is_active', true),
      ])

      // Check for query errors
      const queryError = plansRes.error || weightsRes.error || medsRes.error || mealsRes.error
      if (queryError) {
        console.error('[Dashboard] Query error:', queryError)
        setError('Error al cargar los datos. Intenta de nuevo.')
        setLoading(false)
        return
      }

      const mealsMap = {}
      ;(mealsRes.data || []).forEach(m => { mealsMap[m.day_of_week] = m })

      setData({
        plans: plansRes.data || [],
        weights: weightsRes.data || [],
        meds: medsRes.data || [],
        meals: mealsMap,
      })
    } catch (err) {
      console.error('[Dashboard] loadDashboard error:', err)
      setError('Error inesperado. Intenta recargar la página.')
    } finally {
      setLoading(false)
    }
  }

  if (loading || !data) {
    if (error) {
      return (
        <PatientLayout>
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-sm text-red-500 mb-4">{error}</p>
            <button onClick={loadDashboard} className="btn btn-primary btn-sm">Reintentar</button>
          </div>
        </PatientLayout>
      )
    }
    return <PatientLayout><div className="flex justify-center py-20"><div className="loader" /></div></PatientLayout>
  }

  const today = getTodaySlug()
  const todayPlan = data.plans.find(p => p.day_of_week === today) || data.plans.find(p => p.day_of_week === 'todos') || null
  const todayDiet = todayPlan ? getDietConfig(todayPlan.diet_type) : null
  const todayMeals = data.meals[today] || null

  const lastWeight = data.weights[0] || null
  const prevWeight = data.weights[1] || null
  const weightChange = (lastWeight && prevWeight) ? (Number(lastWeight.weight || 0) - Number(prevWeight.weight || 0)).toFixed(1) : null
  const totalChange = (lastWeight && profile?.initial_weight) ? (Number(lastWeight.weight || 0) - Number(profile.initial_weight)).toFixed(1) : null
  const daysLeft = getDaysRemaining(profile?.code_expiry)

  const hasTodayMeals = todayMeals && (todayMeals.breakfast || todayMeals.lunch || todayMeals.dinner)

  return (
    <PatientLayout>
      {/* ===== TODAY'S DIET + MEALS ===== */}
      {todayDiet && (
        <div className="mb-4 rounded-2xl overflow-hidden" style={{ background: `linear-gradient(135deg, ${todayDiet.bg} 0%, white 100%)`, border: `1px solid ${todayDiet.color}20` }}>
          <div className="px-4 py-3" style={{ borderBottom: hasTodayMeals ? `1px solid ${todayDiet.color}15` : 'none' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: todayDiet.color }}>
              {DAY_LABELS[today]} — Tu dieta hoy
            </p>
            <div className="flex items-center gap-3">
              <span className="text-3xl">{todayDiet.icon}</span>
              <div>
                <p className="text-lg font-bold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>
                  {todayPlan.diet_name || todayDiet.label}
                </p>
                {todayPlan.notes && <p className="text-[11px] text-gray-500">{todayPlan.notes}</p>}
              </div>
            </div>
          </div>

          {hasTodayMeals && (
            <div className="px-4 py-3 space-y-4">
              {['breakfast', 'snack_morning', 'lunch', 'snack_afternoon', 'dinner'].map(key => {
                const value = todayMeals[key]
                if (!value) return null
                const cfg = MEAL_CONFIG[key]
                const Icon = cfg.icon
                return (
                  <div key={key}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: cfg.bg }}>
                        <Icon size={13} style={{ color: cfg.color }} />
                      </div>
                      <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: cfg.color }}>{cfg.label}</p>
                    </div>
                    <div className="ml-9">
                      <MealContent text={value} />
                    </div>
                  </div>
                )
              })}
              {todayMeals.notes && (
                <p className="text-[11px] text-gray-400 italic pt-1 border-t border-gray-100">💡 {todayMeals.notes}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== STATS GRID ===== */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="card !p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Scale size={13} className="text-teal-500" />
            <span className="text-[10px] text-gray-400 font-medium">Último peso</span>
          </div>
          <p className="text-xl font-bold text-gray-900">{lastWeight ? `${Number(lastWeight.weight).toFixed(1)}` : '—'}</p>
          {weightChange && (
            <p className={`text-[11px] font-semibold flex items-center gap-0.5 ${Number(weightChange) <= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
              {Number(weightChange) <= 0 ? <TrendingDown size={11} /> : <TrendingUp size={11} />}
              {Number(weightChange) > 0 ? '+' : ''}{weightChange} kg
            </p>
          )}
        </div>
        <div className="card !p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingDown size={13} className="text-blue-500" />
            <span className="text-[10px] text-gray-400 font-medium">Total</span>
          </div>
          <p className="text-xl font-bold text-gray-900">{totalChange ? `${Number(totalChange) > 0 ? '+' : ''}${totalChange}` : '—'}</p>
          <p className="text-[10px] text-gray-400">kg desde inicio</p>
        </div>
        <div className="card !p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Pill size={13} className="text-purple-500" />
            <span className="text-[10px] text-gray-400 font-medium">Medicación</span>
          </div>
          <p className="text-xl font-bold text-gray-900">{data.meds.length}</p>
          <p className="text-[10px] text-gray-400">fármacos activos</p>
        </div>
      </div>

      {/* ===== WEEKLY PLAN ===== */}
      <div className="mb-4">
        <p className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Calendar size={14} /> Plan semanal
        </p>
        <div className="space-y-2">
          {DAYS_ORDER.map(day => {
            const plan = data.plans.find(p => p.day_of_week === day) || data.plans.find(p => p.day_of_week === 'todos')
            const cfg = plan ? getDietConfig(plan.diet_type) : null
            const isToday = day === today
            const dayMeals = data.meals[day]
            const hasMeals = dayMeals && (dayMeals.breakfast || dayMeals.lunch || dayMeals.dinner)
            const isExpanded = expandedDay === day

            return (
              <div key={day}
                className={`rounded-xl overflow-hidden transition-all ${isToday ? 'ring-2 ring-[var(--color-brand)] ring-offset-1' : ''}`}
                style={cfg ? { background: isExpanded ? 'white' : cfg.bg, border: `1px solid ${cfg.color}20` } : { background: '#F9FAFB', border: '1px solid #E5E7EB' }}
              >
                <button
                  onClick={() => hasMeals && setExpandedDay(isExpanded ? null : day)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 transition ${hasMeals ? 'cursor-pointer hover:bg-white/60' : 'cursor-default'}`}
                >
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    {isToday && <span className="w-2 h-2 rounded-full bg-[var(--color-brand)] animate-pulse flex-shrink-0" />}
                    <span className="text-base leading-none">{cfg?.icon || '—'}</span>
                    <div className="text-left min-w-0">
                      <p className={`text-xs font-semibold ${isToday ? 'text-[var(--color-brand)]' : 'text-gray-700'}`}>
                        {DAY_LABELS[day]}
                      </p>
                      {cfg && <p className="text-[10px] truncate" style={{ color: cfg.color }}>{plan.diet_name || cfg.label}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {hasMeals && (
                      <>
                        <MealDots meals={dayMeals} />
                        {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                      </>
                    )}
                    {!hasMeals && <span className="text-[10px] text-gray-300">Sin menú</span>}
                  </div>
                </button>

                {isExpanded && hasMeals && (
                  <div className="px-3 pb-3 pt-2 space-y-3 border-t bg-white" style={{ borderColor: cfg ? `${cfg.color}15` : '#E5E7EB' }}>
                    {['breakfast', 'snack_morning', 'lunch', 'snack_afternoon', 'dinner'].map(key => {
                      const value = dayMeals[key]
                      if (!value) return null
                      const mCfg = MEAL_CONFIG[key]
                      const Icon = mCfg.icon
                      return (
                        <div key={key}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: mCfg.bg }}>
                              <Icon size={12} style={{ color: mCfg.color }} />
                            </div>
                            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: mCfg.color }}>{mCfg.label}</p>
                          </div>
                          <div className="ml-8">
                            <MealContent text={value} compact />
                          </div>
                        </div>
                      )
                    })}
                    {dayMeals.notes && <p className="text-[10px] text-gray-400 italic pt-1">💡 {dayMeals.notes}</p>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ===== ACTIVE MEDICATIONS ===== */}
      {data.meds.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <Pill size={14} /> Medicación activa
          </p>
          <div className="space-y-2">
            {data.meds.slice(0, 3).map(med => (
              <div key={med.id} className="card !p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-purple-500">
                  <Pill size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{med.medication_name}</p>
                  <p className="text-[11px] text-gray-400">{[med.dosage, med.frequency].filter(Boolean).join(' · ')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== ACCESS COUNTDOWN ===== */}
      {daysLeft !== null && (
        <div className="card !p-3 flex items-center gap-3" style={{ background: daysLeft <= 7 ? '#FEF3C7' : '#F0FDFA' }}>
          <Clock size={16} className={daysLeft <= 7 ? 'text-amber-500' : 'text-teal-400'} />
          <p className="text-xs text-gray-600">
            {daysLeft <= 0 ? 'Tu acceso ha expirado. Contacta con la consulta.'
              : daysLeft <= 7 ? `Tu acceso expira en ${daysLeft} días`
              : `Acceso activo · ${daysLeft} días restantes`}
          </p>
        </div>
      )}
    </PatientLayout>
  )
}

function MealDots({ meals }) {
  if (!meals) return null
  const dots = [
    { key: 'breakfast', color: MEAL_CONFIG.breakfast.color, filled: !!meals.breakfast },
    { key: 'lunch', color: MEAL_CONFIG.lunch.color, filled: !!meals.lunch },
    { key: 'dinner', color: MEAL_CONFIG.dinner.color, filled: !!meals.dinner },
  ]
  return (
    <div className="flex gap-1">
      {dots.map(d => (
        <span key={d.key} className="w-2 h-2 rounded-full"
          style={{ background: d.filled ? d.color : '#E5E7EB' }}
          title={d.filled ? MEAL_CONFIG[d.key].label : `Sin ${MEAL_CONFIG[d.key].label.toLowerCase()}`}
        />
      ))}
    </div>
  )
}
