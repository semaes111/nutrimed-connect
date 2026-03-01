import { useState, useEffect } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'
import { getDietConfig, DAYS_ORDER, DAY_LABELS, getTodaySlug, getDaysRemaining } from '../../lib/dietConfig'
import PatientLayout from '../../components/layout/PatientLayout'
import { Scale, Pill, Calendar, Clock, TrendingDown, TrendingUp } from 'lucide-react'

export default function PatientDashboard() {
  const { profile } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.id) return
    loadDashboard()
  }, [profile?.id])

  async function loadDashboard() {
    setLoading(true)
    const pid = profile.id
    const [plansRes, weightsRes, medsRes] = await Promise.all([
      supabase.from('nm_diet_plans').select('*').eq('patient_id', pid).eq('is_active', true),
      supabase.from('nm_weight_records').select('*').eq('patient_id', pid).order('date', { ascending: false }).limit(10),
      supabase.from('nm_medications').select('*').eq('patient_id', pid).eq('is_active', true),
    ])
    setData({
      plans: plansRes.data || [],
      weights: weightsRes.data || [],
      meds: medsRes.data || [],
    })
    setLoading(false)
  }

  if (loading || !data) {
    return <PatientLayout><div className="flex justify-center py-20"><div className="loader" /></div></PatientLayout>
  }

  const today = getTodaySlug()
  const todayPlan = data.plans.find(p => p.day_of_week === today) || data.plans.find(p => p.day_of_week === 'todos')
  const todayDiet = todayPlan ? getDietConfig(todayPlan.diet_type) : null

  const lastWeight = data.weights[0]
  const prevWeight = data.weights[1]
  const weightChange = lastWeight && prevWeight ? (Number(lastWeight.weight) - Number(prevWeight.weight)).toFixed(1) : null
  const totalChange = lastWeight && profile.initial_weight ? (Number(lastWeight.weight) - Number(profile.initial_weight)).toFixed(1) : null

  const daysLeft = getDaysRemaining(profile.code_expiry)

  return (
    <PatientLayout>
      {/* Today's diet card */}
      {todayDiet && (
        <div className="card card--elevated mb-4" style={{ background: `linear-gradient(135deg, ${todayDiet.bg} 0%, white 100%)`, borderLeft: `4px solid ${todayDiet.color}` }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: todayDiet.color }}>Dieta de hoy — {DAY_LABELS[today]}</p>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{todayDiet.icon}</span>
            <div>
              <p className="text-lg font-bold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>{todayPlan.diet_name || todayDiet.label}</p>
              {todayPlan.notes && <p className="text-xs text-gray-500 mt-0.5">{todayPlan.notes}</p>}
            </div>
          </div>
        </div>
      )}

      {/* Stats grid */}
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

      {/* Weekly plan */}
      <div className="mb-4">
        <p className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Calendar size={14} /> Plan semanal
        </p>
        <div className="grid grid-cols-7 gap-1.5">
          {DAYS_ORDER.map(day => {
            const plan = data.plans.find(p => p.day_of_week === day) || data.plans.find(p => p.day_of_week === 'todos')
            const cfg = plan ? getDietConfig(plan.diet_type) : null
            const isToday = day === today
            return (
              <div key={day} className={`text-center rounded-xl py-2 px-0.5 transition ${isToday ? 'ring-2 ring-[var(--color-brand)] ring-offset-1' : ''}`}
                style={cfg ? { background: cfg.bg } : { background: '#F9FAFB' }}>
                <p className={`text-[9px] font-semibold ${isToday ? 'text-[var(--color-brand)]' : 'text-gray-400'}`}>
                  {DAY_LABELS[day]?.slice(0, 3)}
                </p>
                <span className="text-base leading-none">{cfg?.icon || '—'}</span>
                {cfg && <p className="text-[8px] font-semibold truncate px-0.5" style={{ color: cfg.color }}>{cfg.label}</p>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Active medications */}
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

      {/* Access countdown */}
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
