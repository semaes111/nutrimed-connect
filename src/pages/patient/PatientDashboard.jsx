import { useState, useEffect } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'
import { getDietConfig, DAYS_ORDER, DAY_LABELS, getTodaySlug, getDaysRemaining } from '../../lib/dietConfig'
import PatientLayout from '../../components/layout/PatientLayout'
import { usePageTheme } from '../../lib/usePageTheme'
import { Scale, Pill, Calendar, Clock, TrendingDown, TrendingUp, Coffee, Sun, Moon, Cookie, ChevronDown, ChevronUp } from 'lucide-react'

/* ── Meal icons/labels — colores de acento siempre vibrantes ───────── */
const MEAL_BASE = {
  breakfast:       { icon: Coffee, label: 'Desayuno',     colorDark: '#FBBF24', colorLight: '#78350F' },
  lunch:           { icon: Sun,    label: 'Comida',       colorDark: '#FB923C', colorLight: '#7C2D12' },
  dinner:          { icon: Moon,   label: 'Cena',         colorDark: '#818CF8', colorLight: '#312E81' },
  snack_morning:   { icon: Cookie, label: 'Media mañana', colorDark: '#F472B6', colorLight: '#831843' },
  snack_afternoon: { icon: Cookie, label: 'Merienda',     colorDark: '#F472B6', colorLight: '#831843' },
}

function getMealConfig(isDark) {
  return Object.fromEntries(
    Object.entries(MEAL_BASE).map(([k, v]) => {
      const c = isDark ? v.colorDark : v.colorLight
      return [k, { ...v, color: c, bg: `${c}18` }]
    })
  )
}

/* ── Section styles para secciones de dieta ─────────────────────────── */
function getSectionStyle(tc) {
  return {
    'BASE FIJA':          { badge: '🔒 Base fija',        bg: tc.sectionBgBlue,   border: tc.sectionBorderBlue,   text: tc.accentBlue },
    'OPCIONES VARIABLES': { badge: '✨ Elige una opción',  bg: tc.sectionBgPurple, border: tc.sectionBorderPurple, text: tc.accentPurple },
    'OPCIÓN A':           { badge: 'Opción A',             bg: tc.sectionBgGreen,  border: tc.sectionBorderGreen,  text: tc.accentGreen },
    'OPCIÓN B':           { badge: 'Opción B',             bg: tc.sectionBgYellow, border: tc.sectionBorderYellow, text: tc.accentYellow },
    'OPCIÓN C':           { badge: 'Opción C',             bg: tc.sectionBgRed,    border: tc.sectionBorderRed,    text: tc.accentRed },
    'OPCIÓN D':           { badge: 'Opción D',             bg: tc.sectionBgBlue,   border: tc.sectionBorderBlue,   text: tc.accentBlue },
    'OPCIÓN E':           { badge: 'Opción E',             bg: tc.sectionBgPurple, border: tc.sectionBorderPurple, text: tc.accentPurple },
  }
}

/* ── MealContent — renderiza texto de dieta estructurado ─────────────── */
function MealContent({ text, compact = false, tc }) {
  if (!text) return null
  const SECTION_STYLE = getSectionStyle(tc)
  const baseTextSize = compact ? 'text-[12px]' : 'text-[13px]'

  try {
    if (!text.includes('═══')) {
      return (
        <p className={`${baseTextSize} leading-relaxed whitespace-pre-line font-medium`}
          style={{ color: tc.textBody }}>
          {text}
        </p>
      )
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

    if (sections.length === 0) {
      return <p className={`${baseTextSize} leading-relaxed whitespace-pre-line font-medium`} style={{ color: tc.textBody }}>{text}</p>
    }

    return (
      <div className={`space-y-2 ${compact ? 'text-[11px]' : 'text-[12px]'}`}>
        {sections.map((s, i) => {
          const style = s.title ? SECTION_STYLE[s.title] : null
          if (!style) {
            return s.content
              ? <p key={i} className="leading-relaxed whitespace-pre-line font-medium" style={{ color: tc.textSecondary }}>{s.content}</p>
              : null
          }
          return (
            <div key={i} className="rounded-xl overflow-hidden"
              style={{ background: style.bg, border: `1px solid ${style.border}` }}>
              {/* Badge header */}
              <div className="px-3 py-1.5" style={{ borderBottom: `1px solid ${style.border}` }}>
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: style.text }}>
                  {style.badge}
                </span>
              </div>
              {/* Content */}
              <div className="px-3 py-2">
                <p className="leading-relaxed whitespace-pre-line font-medium" style={{ color: tc.textBody }}>
                  {s.content}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    )
  } catch {
    return <p className={`${baseTextSize} leading-relaxed whitespace-pre-line font-medium`} style={{ color: tc.textBody }}>{text}</p>
  }
}

/* ── Dots indicadores de comidas ─────────────────────────────────────── */
function MealDots({ meals, isDark }) {
  if (!meals) return null
  const MEAL_CFG = getMealConfig(isDark)
  const dots = ['breakfast', 'lunch', 'dinner'].map(k => ({
    key: k, color: MEAL_CFG[k].color, filled: !!meals[k], label: MEAL_CFG[k].label,
  }))
  const emptyFill = isDark ? '#2A2F38' : '#C8D3E8'
  return (
    <div className="flex gap-1">
      {dots.map(d => (
        <span key={d.key} className="w-2 h-2 rounded-full"
          style={{ background: d.filled ? d.color : emptyFill, boxShadow: d.filled ? `0 0 6px ${d.color}50` : 'none' }}
          title={d.filled ? d.label : `Sin ${d.label.toLowerCase()}`} />
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ═══════════════════════════════════════════════════════════════════════ */
export default function PatientDashboard() {
  const { profile } = useAuth()
  const tc = usePageTheme()
  const MEAL_CONFIG = getMealConfig(tc.isDark)

  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [expandedDay, setExpanded] = useState(null)

  /* Styles dinámicos */
  const NEU_CARD = {
    background: tc.cardBg, border: tc.cardBorder,
    boxShadow: tc.cardShadow, borderRadius: 20,
  }
  const NEU_STAT = { ...NEU_CARD, padding: 14, borderRadius: 18 }
  const NEU_INSET = {
    background: tc.cardInsetBg, boxShadow: tc.cardInsetShadow,
    border: tc.cardInsetBorder, borderRadius: 16,
  }

  useEffect(() => { if (profile?.id) loadDashboard() }, [profile?.id])

  async function loadDashboard() {
    try {
      setLoading(true); setError(null)
      const pid = profile.id
      const [plansRes, weightsRes, medsRes, mealsRes] = await Promise.all([
        supabase.from('nm_diet_plans').select('*').eq('patient_id', pid).eq('is_active', true),
        supabase.from('nm_weight_records').select('*').eq('patient_id', pid).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(10),
        supabase.from('nm_medications').select('*').eq('patient_id', pid).eq('is_active', true),
        supabase.from('nm_daily_meals').select('*').eq('patient_id', pid).eq('is_active', true),
      ])
      if (plansRes.error || weightsRes.error || medsRes.error || mealsRes.error) {
        setError('Error al cargar los datos. Intenta de nuevo.'); setLoading(false); return
      }
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
          <p className="text-sm mb-4 font-medium" style={{ color: tc.textDanger }}>{error}</p>
          <button onClick={loadDashboard} className="btn btn-primary btn-sm">Reintentar</button>
        </div>
      </PatientLayout>
    )
    return <PatientLayout><div className="flex justify-center py-20"><div className="loader" /></div></PatientLayout>
  }

  const today       = getTodaySlug()
  const todayPlan   = data.plans.find(p => p.day_of_week === today) || data.plans.find(p => p.day_of_week === 'todos') || null
  const todayDiet   = todayPlan ? getDietConfig(todayPlan.diet_type) : null
  const todayMeals  = data.meals[today] || null
  const lastWeight  = data.weights[0] || null
  const prevWeight  = data.weights[1] || null
  const weightChange = (lastWeight && prevWeight)
    ? (Number(lastWeight.weight || 0) - Number(prevWeight.weight || 0)).toFixed(1) : null
  const totalChange  = (lastWeight && profile?.initial_weight)
    ? (Number(lastWeight.weight || 0) - Number(profile.initial_weight)).toFixed(1) : null
  const daysLeft = getDaysRemaining(profile?.code_expiry)
  const hasTodayMeals = todayMeals && (todayMeals.breakfast || todayMeals.lunch || todayMeals.dinner)

  return (
    <PatientLayout>

      {/* ═══ HERO — Dieta de hoy ═══ */}
      {!todayDiet && (
        <div className="mb-4 rounded-[22px] p-5 text-center"
          style={{ background: tc.cardBg, border: tc.cardBorder }}>
          <p className="text-2xl mb-2">🥗</p>
          <p className="text-sm font-semibold" style={{ color: tc.textPrimary }}>Plan nutricional en preparación</p>
          <p className="text-xs mt-1" style={{ color: tc.textMuted }}>Tu dietista está configurando tu plan. Vuelve pronto.</p>
        </div>
      )}
      {todayDiet && (
        <div className="mb-4 rounded-[22px] overflow-hidden" style={{
          background: tc.heroDietGradient(todayDiet.color, todayDiet.bg),
          border: `1px solid ${todayDiet.color}${tc.isDark ? '25' : '35'}`,
          boxShadow: tc.heroDietShadow(todayDiet.color),
        }}>
          {/* Cabecera dieta */}
          <div className="px-4 py-3.5" style={{ borderBottom: hasTodayMeals ? `1px solid ${todayDiet.color}${tc.isDark ? '15' : '25'}` : 'none' }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: todayDiet.color }}>
              {DAY_LABELS[today]} — Tu dieta hoy
            </p>
            <div className="flex items-center gap-3">
              <span className="text-3xl" style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.25))' }}>{todayDiet.icon}</span>
              <div>
                <p className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: tc.textPrimary }}>
                  {todayPlan.diet_name || todayDiet.label}
                </p>
                {todayPlan.notes && <p className="text-[11px] font-medium" style={{ color: tc.textMuted }}>{todayPlan.notes}</p>}
              </div>
            </div>
          </div>

          {/* Comidas del día */}
          {!hasTodayMeals && (
            <div className="px-4 py-3">
              <p className="text-[11px] font-medium text-center" style={{ color: tc.textFaint }}>
                📋 Menú del día pendiente de configuración
              </p>
            </div>
          )}
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
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: cfg.bg, border: `1px solid ${cfg.color}30` }}>
                        <Icon size={13} style={{ color: cfg.color }} />
                      </div>
                      <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: cfg.color }}>{cfg.label}</p>
                    </div>
                    <div className="ml-9"><MealContent text={value} tc={tc} /></div>
                  </div>
                )
              })}
              {todayMeals.notes && (
                <p className="text-[11px] italic font-medium pt-1.5"
                  style={{ color: tc.textMuted, borderTop: `1px solid ${tc.divider}` }}>
                  💡 {todayMeals.notes}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ STATS ═══ */}
      <div className="grid grid-cols-3 gap-2.5 mb-4">
        {/* Peso actual */}
        <div style={NEU_STAT}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Scale size={13} style={{ color: tc.textAccent }} />
            <span className="text-[10px] font-semibold" style={{ color: tc.textMuted }}>Peso</span>
          </div>
          <p className="text-xl font-bold" style={{ color: tc.textPrimary }}>
            {lastWeight ? Number(lastWeight.weight).toFixed(1) : '—'}
          </p>
          {weightChange && (
            <p className="text-[11px] font-semibold flex items-center gap-0.5"
              style={{ color: Number(weightChange) <= 0 ? (tc.isDark ? '#34D399' : '#065F46') : (tc.isDark ? '#FB7185' : '#9F1239') }}>
              {Number(weightChange) <= 0 ? <TrendingDown size={11} /> : <TrendingUp size={11} />}
              {Number(weightChange) > 0 ? '+' : ''}{weightChange} kg
            </p>
          )}
        </div>
        {/* Total perdido */}
        <div style={NEU_STAT}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <TrendingDown size={13} style={{ color: tc.accentBlue }} />
            <span className="text-[10px] font-semibold" style={{ color: tc.textMuted }}>Total</span>
          </div>
          <p className="text-xl font-bold" style={{ color: tc.textPrimary }}>
            {totalChange ? `${Number(totalChange) > 0 ? '+' : ''}${totalChange}` : '—'}
          </p>
          <p className="text-[10px] font-medium" style={{ color: tc.textDimmed }}>kg desde inicio</p>
        </div>
        {/* Medicación */}
        <div style={NEU_STAT}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Pill size={13} style={{ color: tc.accentPurple }} />
            <span className="text-[10px] font-semibold" style={{ color: tc.textMuted }}>Meds</span>
          </div>
          <p className="text-xl font-bold" style={{ color: tc.textPrimary }}>{data.meds.length}</p>
          <p className="text-[10px] font-medium" style={{ color: tc.textDimmed }}>activos</p>
        </div>
      </div>

      {/* ═══ PLAN SEMANAL ═══ */}
      <div className="mb-4">
        <p className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: tc.textPrimary }}>
          <Calendar size={14} style={{ color: tc.textAccent }} /> Plan semanal
        </p>
        <div className="space-y-2">
          {DAYS_ORDER.map(day => {
            const plan     = data.plans.find(p => p.day_of_week === day) || data.plans.find(p => p.day_of_week === 'todos')
            const cfg      = plan ? getDietConfig(plan.diet_type) : null
            const isToday  = day === today
            const dayMeals = data.meals[day]
            const hasMeals = dayMeals && (dayMeals.breakfast || dayMeals.lunch || dayMeals.dinner)
            const isExpanded = expandedDay === day
            const expandBg = tc.isDark
              ? 'linear-gradient(145deg, #2C3140, #232830)'
              : 'linear-gradient(145deg, #F5F8FF, #EBF0FA)'

            return (
              <div key={day} className="rounded-[18px] overflow-hidden transition-all"
                style={{
                  ...(isExpanded
                    ? { background: expandBg, border: tc.cardBorder, boxShadow: tc.cardShadow, borderRadius: 18 }
                    : NEU_CARD),
                  ...(isToday ? { outline: `1.5px solid ${cfg?.color || tc.textAccent}50` } : {}),
                  padding: 0,
                }}>
                <button
                  onClick={() => hasMeals && setExpanded(isExpanded ? null : day)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 ${hasMeals ? 'cursor-pointer' : 'cursor-default'}`}
                  style={{ background: 'transparent' }}>
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    {isToday && (
                      <span className="w-2 h-2 rounded-full animate-pulse flex-shrink-0"
                        style={{ background: tc.textAccent, boxShadow: `0 0 8px ${tc.textAccent}80` }} />
                    )}
                    <span className="text-base leading-none">{cfg?.icon || '—'}</span>
                    <div className="text-left min-w-0">
                      <p className="text-xs font-bold" style={{ color: isToday ? tc.textAccent : tc.textBody }}>
                        {DAY_LABELS[day]}
                      </p>
                      {cfg && (
                        <p className="text-[10px] font-semibold truncate" style={{ color: cfg.color }}>
                          {plan.diet_name || cfg.label}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {hasMeals && (
                      <>
                        <MealDots meals={dayMeals} isDark={tc.isDark} />
                        {isExpanded
                          ? <ChevronUp size={14} style={{ color: tc.textMuted }} />
                          : <ChevronDown size={14} style={{ color: tc.textMuted }} />}
                      </>
                    )}
                    {!hasMeals && (
                      <span className="text-[10px] font-medium" style={{ color: tc.textFaint }}>Sin menú</span>
                    )}
                  </div>
                </button>

                {isExpanded && hasMeals && (
                  <div className="px-3.5 pb-3 pt-2 space-y-3"
                    style={{
                      borderTop: `1px solid ${tc.divider}`,
                      background: tc.isDark ? 'rgba(26,29,35,0.5)' : 'rgba(235,240,250,0.6)',
                    }}>
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
                            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: mCfg.color }}>
                              {mCfg.label}
                            </p>
                          </div>
                          <div className="ml-8"><MealContent text={value} compact tc={tc} /></div>
                        </div>
                      )
                    })}
                    {dayMeals.notes && (
                      <p className="text-[10px] italic font-medium pt-1" style={{ color: tc.textDimmed }}>
                        💡 {dayMeals.notes}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ═══ MEDICACIÓN ═══ */}
      {data.meds.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: tc.textPrimary }}>
            <Pill size={14} style={{ color: tc.accentPurple }} /> Medicación activa
          </p>
          <div className="space-y-2">
            {data.meds.slice(0, 3).map(med => (
              <div key={med.id} className="flex items-center gap-3"
                style={{ ...NEU_CARD, padding: 12, borderRadius: 16 }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: tc.isDark ? 'rgba(192,132,252,0.10)' : 'rgba(76,29,149,0.10)', border: `1px solid ${tc.accentPurple}25` }}>
                  <Pill size={14} style={{ color: tc.accentPurple }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: tc.textPrimary }}>{med.medication_name}</p>
                  <p className="text-[11px] font-medium" style={{ color: tc.textMuted }}>
                    {[med.dosage, med.frequency].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ CONTADOR ACCESO ═══ */}
      {daysLeft !== null && (
        <div className="flex items-center gap-3 p-3.5 rounded-[18px]" style={NEU_INSET}>
          <Clock size={16} style={{ color: daysLeft <= 7 ? (tc.isDark ? '#FBBF24' : '#92400E') : tc.textAccent }} />
          <p className="text-xs font-medium" style={{ color: tc.textSecondary }}>
            {daysLeft <= 0
              ? 'Tu acceso ha expirado. Contacta con la consulta.'
              : daysLeft <= 7
                ? `Tu acceso expira en ${daysLeft} días`
                : `Acceso activo · ${daysLeft} días restantes`}
          </p>
        </div>
      )}
    </PatientLayout>
  )
}
