import { useState, useEffect } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/dietConfig'
import PatientLayout from '../../components/layout/PatientLayout'
import { usePageTheme } from '../../lib/usePageTheme'
import { Pill, Clock, AlertTriangle, ChevronDown, ChevronUp, Info } from 'lucide-react'

export default function MedsView() {
  const { profile } = useAuth()
  const tc = usePageTheme()
  const [meds, setMeds]       = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  const NEU_CARD = { background: tc.cardBg, border: tc.cardBorder, boxShadow: tc.cardShadow, borderRadius: 20 }

  useEffect(() => { if (profile?.id) load() }, [profile?.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('nm_medications').select('*')
      .eq('patient_id', profile.id)
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: false })
    setMeds(data || [])
    setLoading(false)
  }

  const activeMeds   = meds.filter(m => m.is_active)
  const inactiveMeds = meds.filter(m => !m.is_active)

  const warningBg     = tc.isDark ? 'rgba(251,191,36,0.06)'  : 'rgba(120,53,15,0.07)'
  const warningBorder = tc.isDark ? 'rgba(251,191,36,0.14)'  : 'rgba(120,53,15,0.18)'
  const warningText   = tc.isDark ? '#A88B2D'                : '#78350F'
  const warningIcon   = tc.isDark ? '#FBBF24'                : '#92400E'

  return (
    <PatientLayout title="Medicación">
      {loading ? (
        <div className="flex justify-center py-20"><div className="loader" /></div>
      ) : meds.length === 0 ? (
        <div className="text-center py-16 rounded-[20px]" style={NEU_CARD}>
          <Pill size={40} className="mx-auto mb-3" style={{ color: tc.textFaint }} />
          <p className="text-sm font-medium" style={{ color: tc.textDimmed }}>No tienes medicación asignada</p>
        </div>
      ) : (
        <>
          {activeMeds.length > 0 && (
            <div className="mb-6">
              <p className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: tc.textPrimary }}>
                <Pill size={14} style={{ color: tc.accentPurple }} />
                Medicación activa ({activeMeds.length})
              </p>
              <div className="space-y-2">
                {activeMeds.map(med => (
                  <MedCard key={med.id} med={med} tc={tc}
                    expanded={expanded === med.id}
                    onToggle={() => setExpanded(expanded === med.id ? null : med.id)} />
                ))}
              </div>
            </div>
          )}
          {inactiveMeds.length > 0 && (
            <div>
              <p className="text-sm font-semibold mb-2" style={{ color: tc.textMuted }}>Anteriores</p>
              <div className="space-y-2 opacity-60">
                {inactiveMeds.map(med => (
                  <MedCard key={med.id} med={med} tc={tc}
                    expanded={expanded === med.id}
                    onToggle={() => setExpanded(expanded === med.id ? null : med.id)} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Aviso legal */}
      <div className="mt-6 p-4 rounded-[18px]"
        style={{ background: warningBg, border: `1px solid ${warningBorder}` }}>
        <div className="flex gap-2.5">
          <Info size={14} style={{ color: warningIcon, marginTop: 2, flexShrink: 0 }} />
          <p className="text-xs font-medium" style={{ color: warningText }}>
            La medicación es prescrita y ajustada por tu profesional. No modifiques dosis sin consultar.
          </p>
        </div>
      </div>
    </PatientLayout>
  )
}

function MedCard({ med, expanded, onToggle, tc }) {
  const warningBg     = tc.isDark ? 'rgba(251,191,36,0.06)'  : 'rgba(120,53,15,0.07)'
  const warningBorder = tc.isDark ? 'rgba(251,191,36,0.14)'  : 'rgba(120,53,15,0.18)'
  const warningText   = tc.isDark ? '#A88B2D'                : '#78350F'
  const warningIcon   = tc.isDark ? '#FBBF24'                : '#92400E'
  const iconColor     = med.is_active ? tc.accentPurple : tc.textFaint
  const iconBg        = med.is_active
    ? (tc.isDark ? 'rgba(192,132,252,0.10)' : 'rgba(76,29,149,0.10)')
    : (tc.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)')

  return (
    <div className="overflow-hidden rounded-[18px]"
      style={{ background: tc.cardBg, border: tc.cardBorder, boxShadow: tc.cardShadow }}>
      <button onClick={onToggle}
        className="w-full flex items-center gap-3 p-3.5 text-left cursor-pointer"
        style={{ background: 'transparent' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: iconBg, border: `1px solid ${iconColor}25` }}>
          <Pill size={16} style={{ color: iconColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: tc.textPrimary }}>
            {med.medication_name}
          </p>
          <p className="text-[11px] font-medium" style={{ color: tc.textMuted }}>
            {[med.dosage, med.frequency].filter(Boolean).join(' · ')}
          </p>
        </div>
        {expanded
          ? <ChevronUp size={14} style={{ color: tc.textMuted }} />
          : <ChevronDown size={14} style={{ color: tc.textMuted }} />}
      </button>

      {expanded && (
        <div className="px-3.5 pb-3.5 pt-0 space-y-2"
          style={{ borderTop: `1px solid ${tc.divider}` }}>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {med.start_date && (
              <div className="text-[11px]">
                <span className="flex items-center gap-1 font-semibold" style={{ color: tc.textMuted }}>
                  <Clock size={10} /> Inicio
                </span>
                <span className="font-bold" style={{ color: tc.textSecondary }}>{formatDate(med.start_date)}</span>
              </div>
            )}
            {med.end_date && (
              <div className="text-[11px]">
                <span className="font-semibold" style={{ color: tc.textMuted }}>Fin previsto</span>
                <span className="font-bold block" style={{ color: tc.textSecondary }}>{formatDate(med.end_date)}</span>
              </div>
            )}
          </div>
          {med.side_effects && (
            <div className="rounded-xl p-2.5"
              style={{ background: warningBg, border: `1px solid ${warningBorder}` }}>
              <p className="text-[11px] font-bold flex items-center gap-1 mb-1" style={{ color: warningIcon }}>
                <AlertTriangle size={11} /> Posibles efectos secundarios
              </p>
              <p className="text-[11px] font-medium" style={{ color: warningText }}>{med.side_effects}</p>
              {med.side_effects_treatment && (
                <p className="text-[11px] mt-1 font-semibold" style={{ color: warningIcon }}>
                  Solución: {med.side_effects_treatment}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
