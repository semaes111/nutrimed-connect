import { useState, useEffect } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'
import { getDietConfig, DAYS_ORDER, DAY_LABELS, getTodaySlug, getDaysRemaining } from '../../lib/dietConfig'
import PatientLayout from '../../components/layout/PatientLayout'
import { Scale, Pill, Calendar, Clock, TrendingDown, TrendingUp, Coffee, Sun, Moon, Cookie, ChevronDown, ChevronUp } from 'lucide-react'

const MEAL_CONFIG = {
  breakfast:       { icon: Coffee, label: 'Desayuno',      color: '#FBBF24', bg: 'rgba(251,191,36,0.1)' },
  lunch:           { icon: Sun,    label: 'Comida',        color: '#FB923C', bg: 'rgba(251,146,60,0.1)' },
  dinner:          { icon: Moon,   label: 'Cena',          color: '#818CF8', bg: 'rgba(129,140,248,0.1)' },
  snack_morning:   { icon: Cookie, label: 'Media mañana',  color: '#F472B6', bg: 'rgba(244,114,182,0.1)' },
  snack_afternoon: { icon: Cookie, label: 'Merienda',      color: '#F472B6', bg: 'rgba(244,114,182,0.1)' },
}

const SECTION_STYLE = {
  'BASE FIJA':            { badge: '🔒 Base fija', bg: 'rgba(96,165,250,0.06)', border: 'rgba(96,165,250,0.15)', text: '#60A5FA' },
  'OPCIONES VARIABLES':   { badge: '✨ Elige una opción', bg: 'rgba(192,132,252,0.06)', border: 'rgba(192,132,252,0.15)', text: '#C084FC' },
  'OPCIÓN A':             { badge: 'Opción A', bg: 'rgba(52,211,153,0.06)', border: 'rgba(52,211,153,0.15)', text: '#34D399' },
  'OPCIÓN B':             { badge: 'Opción B', bg: 'rgba(251,191,36,0.06)', border: 'rgba(251,191,36,0.15)', text: '#FBBF24' },
  'OPCIÓN C':             { badge: 'Opción C', bg: 'rgba(251,113,133,0.06)', border: 'rgba(251,113,133,0.15)', text: '#FB7185' },
  'OPCIÓN D':             { badge: 'Opción D', bg: 'rgba(96,165,250,0.06)', border: 'rgba(96,165,250,0.15)', text: '#60A5FA' },
  'OPCIÓN E':             { badge: 'Opción E', bg: 'rgba(192,132,252,0.06)', border: 'rgba(192,132,252,0.15)', text: '#C084FC' },
}

/* ── Neumorphic styles used in JSX ── */
const NEU_CARD = {
  background: 'linear-gradient(145deg, #262B34, #1F232B)',
  border: '1px solid rgba(255,255,255,0.04)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.35), -4px -4px 12px rgba(255,255,255,0.025), inset 1px 1px 0 rgba(255,255,255,0.06)',
  borderRadius: 20,
}
const NEU_STAT = {
  ...NEU_CARD,
  padding: 14,
  borderRadius: 18,
}
const NEU_INSET = {
  background: 'linear-gradient(145deg, #1A1D23, #1E2128)',
  boxShadow: 'inset 3px 3px 6px rgba(0,0,0,0.3), inset -2px -2px 4px rgba(255,255,255,0.025)',
  border: '1px solid rgba(255,255,255,0.03)',
  borderRadius: 16,
}

function MealContent({ text, compact = false }) {
  if (!text) return null
  try {
    if (!text.includes('═══')) {
      return <p className={`${compact ? 'text-[12px]' : 'text-[13px]'} leading-relaxed whitespace-pre-line`} style={{ color: '#B0BEC5' }}>{text}</p>
    }
    const parts = text.split('═══')
    const sections = []
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim()
      if (!part) continue
      if (i % 2 === 1) {
        const title = part.trim()
        const content = (i + 1 < parts.length) ? parts[i + 1].trim() : ''
        sections.push({ title, content })
      } else if (i === 0 && part) {
        sections.push({ title: null, content: part })
      }
    }
    if (sections.length === 0) return <p className="text-[13px] leading-relaxed whitespace-pre-line" style={{ color: '#B0BEC5' }}>{text}</p>
    return (
      <div className={`space-y-2 ${compact ? 'text-[11px]' : 'text-[12px]'}`}>
        {sections.map((s, i) => {
          const style = s.title ? SECTION_STYLE[s.title] : null
          if (!style) return s.content ? <p key={i} className="leading-relaxed whitespace-pre-line" style={{ color: '#8896A5' }}>{s.content}</p> : null
          return (
            <div key={i} className="rounded-lg overflow-hidden" style={{ background: style.bg, border: `1px solid ${style.border}` }}>
              <div className="px-2.5 py-1" style={{ borderBottom: `1px solid ${style.border}` }}>
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: style.text }}>{style.badge}</span>
              </div>
              <div className="px-2.5 py-2">
                <p className="leading-relaxed whitespace-pre-line" style={{ color: '#B0BEC5' }}>{s.content}</p>
              </div>
            </div>
          )
        })}
      </div>
    )
  } catch {
    return <p className="text-[13px] leading-relaxed whitespace-pre-line" style={{ color: '#B0BEC5' }}>{text}</p>
  }
}

export default function PatientDashboard() {
  const { profile } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedDay, setExpandedDay] = useState(null)

  useEffect(() => { if (profile?.id) loadDashboard() }, [profile?.id])

  async function loadDashboard() {
    try {
      setLoading(true); setError(null)
      const pid = profile.id
      const [plansRes, weightsRes, medsRes, mealsRes] = await Promise.all([
        supabase.from('nm_diet_plans').select('*').eq('patient_id', pid).eq('is_active', true),
        supabase.from('nm_weight_records').select('*').eq('patient_id', pid).order('date', { ascending: false }).limit(10),
        supabase.from('nm_medications').select('*').eq('patient_id', pid).eq('is_active', true),
        supabase.from('nm_daily_meals').select('*').eq('patient_id', pid).eq('is_active', true),
      ])
      const queryError = plansRes.error || weightsRes.error || medsRes.error || mealsRes.error
      if (queryError) { setError('Error al cargar los datos. Intenta de nuevo.'); setLoading(false); return }
      const mealsMap = {}
      ;(mealsRes.data || []).forEach(m => { mealsMap[m.day_of_week] = m })
      setData({ plans: plansRes.data || [], weights: weightsRes.data || [], meds: medsRes.data || [], meals: mealsMap })
    } catch { setError('Error inesperado. Intenta recargar la página.') }
    finally { setLoading(false) }
  }

  if (loading || !data) {
    if (error) return (
      <PatientLayout>
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-sm mb-4" style={{ color: '#FCA5A5' }}>{error}</p>
          <button onClick={loadDashboard} className="btn btn-primary btn-sm">Reintentar</button>
        </div>
      </PatientLayout>
    )
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
      {/* ===== TODAY'S DIET — Hero card with diet glow ===== */}
      {todayDiet && (
        <div className="mb-4 rounded-[22px] overflow-hidden" style={{
          background: `linear-gradient(145deg, ${todayDiet.bg} 0%, rgba(30,33,40,0.95) 100%)`,
          border: `1px solid ${todayDiet.color}20`,
          boxShadow: `8px 8px 24px rgba(0,0,0,0.4), -4px -4px 12px rgba(255,255,255,0.02), 0 0 40px ${todayDiet.color}08, inset 1px 1px 0 rgba(255,255,255,0.05)`,
        }}>
          <div className="px-4 py-3.5" style={{ borderBottom: hasTodayMeals ? `1px solid ${todayDiet.color}12` : 'none' }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: todayDiet.color }}>
              {DAY_LABELS[today]} — Tu dieta hoy
            </p>
            <div className="flex items-center gap-3">
              <span className="text-3xl" style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.3))' }}>{todayDiet.icon}</span>
              <div>
                <p className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: '#F1F5F9' }}>
                  {todayPlan.diet_name || todayDiet.label}
                </p>
                {todayPlan.notes && <p className="text-[11px]" style={{ color: '#64748B' }}>{todayPlan.notes}</p>}
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
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ background: cfg.bg, boxShadow: `inset 1px 1px 2px rgba(0,0,0,0.2), 0 0 8px ${cfg.color}15` }}>
                        <Icon size={13} style={{ color: cfg.color }} />
                      </div>
                      <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: cfg.color }}>{cfg.label}</p>
                    </div>
                    <div className="ml-9"><MealContent text={value} /></div>
                  </div>
                )
              })}
              {todayMeals.notes && (
                <p className="text-[11px] italic pt-1" style={{ color: '#4A5568', borderTop: '1px solid rgba(255,255,255,0.04)' }}>💡 {todayMeals.notes}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== STATS GRID — 3D metallic stat cards ===== */}
      <div className="grid grid-cols-3 gap-2.5 mb-4">
        <div style={NEU_STAT}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Scale size={13} style={{ color: '#2DD4BF' }} />
            <span className="text-[10px] font-medium" style={{ color: '#64748B' }}>Último peso</span>
          </div>
          <p className="text-xl font-bold" style={{ color: '#F1F5F9' }}>{lastWeight ? `${Number(lastWeight.weight).toFixed(1)}` : '—'}</p>
          {weightChange && (
            <p className="text-[11px] font-semibold flex items-center gap-0.5" style={{ color: Number(weightChange) <= 0 ? '#34D399' : '#FB7185' }}>
              {Number(weightChange) <= 0 ? <TrendingDown size={11} /> : <TrendingUp size={11} />}
              {Number(weightChange) > 0 ? '+' : ''}{weightChange} kg
            </p>
          )}
        </div>
        <div style={NEU_STAT}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <TrendingDown size={13} style={{ color: '#60A5FA' }} />
            <span className="text-[10px] font-medium" style={{ color: '#64748B' }}>Total</span>
          </div>
          <p className="text-xl font-bold" style={{ color: '#F1F5F9' }}>{totalChange ? `${Number(totalChange) > 0 ? '+' : ''}${totalChange}` : '—'}</p>
          <p className="text-[10px]" style={{ color: '#4A5568' }}>kg desde inicio</p>
        </div>
        <div style={NEU_STAT}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Pill size={13} style={{ color: '#C084FC' }} />
            <span className="text-[10px] font-medium" style={{ color: '#64748B' }}>Medicación</span>
          </div>
          <p className="text-xl font-bold" style={{ color: '#F1F5F9' }}>{data.meds.length}</p>
          <p className="text-[10px]" style={{ color: '#4A5568' }}>fármacos activos</p>
        </div>
      </div>

      {/* ===== WEEKLY PLAN — Neumorphic day cards ===== */}
      <div className="mb-4">
        <p className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: '#E2E8F0' }}>
          <Calendar size={14} style={{ color: '#2DD4BF' }} /> Plan semanal
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
              <div key={day} className="rounded-[18px] overflow-hidden transition-all"
                style={{
                  ...(isExpanded ? {} : NEU_CARD),
                  ...(isExpanded ? { background: 'linear-gradient(145deg, #2C3140, #232830)', border: '1px solid rgba(255,255,255,0.04)', boxShadow: '8px 8px 24px rgba(0,0,0,0.4), -4px -4px 12px rgba(255,255,255,0.02), inset 1px 1px 0 rgba(255,255,255,0.06)', borderRadius: 18 } : {}),
                  ...(isToday ? { boxShadow: `8px 8px 24px rgba(0,0,0,0.4), -4px -4px 12px rgba(255,255,255,0.02), 0 0 0 1.5px ${cfg?.color || '#2DD4BF'}40, 0 0 20px ${cfg?.color || '#2DD4BF'}10` } : {}),
                  padding: 0,
                }}>
                <button
                  onClick={() => hasMeals && setExpandedDay(isExpanded ? null : day)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 transition ${hasMeals ? 'cursor-pointer' : 'cursor-default'}`}
                  style={{ background: 'transparent' }}>
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    {isToday && <span className="w-2 h-2 rounded-full animate-pulse flex-shrink-0" style={{ background: '#2DD4BF', boxShadow: '0 0 8px rgba(45,212,191,0.5)' }} />}
                    <span className="text-base leading-none">{cfg?.icon || '—'}</span>
                    <div className="text-left min-w-0">
                      <p className="text-xs font-semibold" style={{ color: isToday ? '#2DD4BF' : '#CBD5E1' }}>{DAY_LABELS[day]}</p>
                      {cfg && <p className="text-[10px] truncate" style={{ color: `${cfg.color}AA` }}>{plan.diet_name || cfg.label}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {hasMeals && (<><MealDots meals={dayMeals} />{isExpanded ? <ChevronUp size={14} style={{ color: '#4A5568' }} /> : <ChevronDown size={14} style={{ color: '#4A5568' }} />}</>)}
                    {!hasMeals && <span className="text-[10px]" style={{ color: '#333A45' }}>Sin menú</span>}
                  </div>
                </button>

                {isExpanded && hasMeals && (
                  <div className="px-3.5 pb-3 pt-2 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: 'rgba(26,29,35,0.4)' }}>
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
                          <div className="ml-8"><MealContent text={value} compact /></div>
                        </div>
                      )
                    })}
                    {dayMeals.notes && <p className="text-[10px] italic pt-1" style={{ color: '#4A5568' }}>💡 {dayMeals.notes}</p>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ===== MEDICATIONS ===== */}
      {data.meds.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: '#E2E8F0' }}>
            <Pill size={14} style={{ color: '#C084FC' }} /> Medicación activa
          </p>
          <div className="space-y-2">
            {data.meds.slice(0, 3).map(med => (
              <div key={med.id} className="flex items-center gap-3" style={{ ...NEU_CARD, padding: 12, borderRadius: 16 }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(192,132,252,0.08)', boxShadow: 'inset 1px 1px 2px rgba(0,0,0,0.2)' }}>
                  <Pill size={14} style={{ color: '#C084FC' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: '#E2E8F0' }}>{med.medication_name}</p>
                  <p className="text-[11px]" style={{ color: '#64748B' }}>{[med.dosage, med.frequency].filter(Boolean).join(' · ')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== ACCESS COUNTDOWN ===== */}
      {daysLeft !== null && (
        <div className="flex items-center gap-3 p-3.5 rounded-[18px]"
          style={{
            ...NEU_INSET,
            ...(daysLeft <= 7 ? { boxShadow: 'inset 3px 3px 6px rgba(0,0,0,0.3), inset -2px -2px 4px rgba(255,255,255,0.025), 0 0 16px rgba(251,191,36,0.05)' } : {}),
          }}>
          <Clock size={16} style={{ color: daysLeft <= 7 ? '#FBBF24' : '#2DD4BF' }} />
          <p className="text-xs" style={{ color: '#94A3B8' }}>
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
          style={{ background: d.filled ? d.color : '#2A2F38', boxShadow: d.filled ? `0 0 6px ${d.color}40` : 'inset 1px 1px 2px rgba(0,0,0,0.3)' }}
          title={d.filled ? MEAL_CONFIG[d.key].label : `Sin ${MEAL_CONFIG[d.key].label.toLowerCase()}`} />
      ))}
    </div>
  )
}
