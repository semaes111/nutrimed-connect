import { useState, useEffect } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/dietConfig'
import PatientLayout from '../../components/layout/PatientLayout'
import { Pill, Clock, AlertTriangle, ChevronDown, ChevronUp, Info } from 'lucide-react'

const NEU_CARD = {
  background: 'linear-gradient(145deg, #262B34, #1F232B)',
  border: '1px solid rgba(255,255,255,0.04)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.35), -4px -4px 12px rgba(255,255,255,0.025), inset 1px 1px 0 rgba(255,255,255,0.06)',
  borderRadius: 20,
}

export default function MedsView() {
  const { profile } = useAuth()
  const [meds, setMeds] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => { if (profile?.id) load() }, [profile?.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('nm_medications').select('*').eq('patient_id', profile.id).order('is_active', { ascending: false }).order('created_at', { ascending: false })
    setMeds(data || [])
    setLoading(false)
  }

  const activeMeds = meds.filter(m => m.is_active)
  const inactiveMeds = meds.filter(m => !m.is_active)

  return (
    <PatientLayout title="Medicación">
      {loading ? (
        <div className="flex justify-center py-20"><div className="loader" /></div>
      ) : meds.length === 0 ? (
        <div className="text-center py-16 rounded-[20px]" style={NEU_CARD}>
          <Pill size={40} className="mx-auto mb-3" style={{ color: '#333A45' }} />
          <p className="text-sm" style={{ color: '#4A5568' }}>No tienes medicación asignada</p>
        </div>
      ) : (
        <>
          {activeMeds.length > 0 && (
            <div className="mb-6">
              <p className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: '#E2E8F0' }}>
                <Pill size={14} style={{ color: '#C084FC' }} />
                Medicación activa ({activeMeds.length})
              </p>
              <div className="space-y-2">
                {activeMeds.map(med => (
                  <MedCard key={med.id} med={med} expanded={expanded === med.id} onToggle={() => setExpanded(expanded === med.id ? null : med.id)} />
                ))}
              </div>
            </div>
          )}
          {inactiveMeds.length > 0 && (
            <div>
              <p className="text-sm font-semibold mb-2" style={{ color: '#4A5568' }}>Anteriores</p>
              <div className="space-y-2 opacity-50">
                {inactiveMeds.map(med => (
                  <MedCard key={med.id} med={med} expanded={expanded === med.id} onToggle={() => setExpanded(expanded === med.id ? null : med.id)} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="mt-6 p-4 rounded-[18px]"
        style={{
          background: 'rgba(251,191,36,0.04)',
          border: '1px solid rgba(251,191,36,0.1)',
          boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.15), 0 0 12px rgba(251,191,36,0.03)',
        }}>
        <div className="flex gap-2">
          <Info size={14} style={{ color: '#FBBF24', marginTop: 2, flexShrink: 0 }} />
          <p className="text-xs" style={{ color: '#A88B2D' }}>La medicación es prescrita y ajustada por tu profesional. No modifiques dosis sin consultar.</p>
        </div>
      </div>
    </PatientLayout>
  )
}

function MedCard({ med, expanded, onToggle }) {
  return (
    <div className="overflow-hidden rounded-[18px]" style={{
      background: 'linear-gradient(145deg, #262B34, #1F232B)',
      border: '1px solid rgba(255,255,255,0.04)',
      boxShadow: '6px 6px 16px rgba(0,0,0,0.35), -4px -4px 12px rgba(255,255,255,0.025), inset 1px 1px 0 rgba(255,255,255,0.06)',
    }}>
      <button onClick={onToggle} className="w-full flex items-center gap-3 p-3.5 text-left cursor-pointer" style={{ background: 'transparent' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: med.is_active ? 'rgba(192,132,252,0.08)' : 'rgba(255,255,255,0.03)',
            boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.2), -1px -1px 3px rgba(255,255,255,0.02)',
          }}>
          <Pill size={16} style={{ color: med.is_active ? '#C084FC' : '#333A45' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: '#E2E8F0' }}>{med.medication_name}</p>
          <p className="text-[11px]" style={{ color: '#64748B' }}>{[med.dosage, med.frequency].filter(Boolean).join(' · ')}</p>
        </div>
        {expanded ? <ChevronUp size={14} style={{ color: '#4A5568' }} /> : <ChevronDown size={14} style={{ color: '#4A5568' }} />}
      </button>

      {expanded && (
        <div className="px-3.5 pb-3.5 pt-0 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {med.start_date && (
              <div className="text-[11px]">
                <span className="flex items-center gap-1" style={{ color: '#4A5568' }}><Clock size={10} /> Inicio</span>
                <span className="font-medium" style={{ color: '#94A3B8' }}>{formatDate(med.start_date)}</span>
              </div>
            )}
            {med.end_date && (
              <div className="text-[11px]">
                <span style={{ color: '#4A5568' }}>Fin previsto</span>
                <span className="font-medium" style={{ color: '#94A3B8' }}>{formatDate(med.end_date)}</span>
              </div>
            )}
          </div>
          {med.side_effects && (
            <div className="rounded-lg p-2.5" style={{ background: 'rgba(251,191,36,0.04)', border: '1px solid rgba(251,191,36,0.1)' }}>
              <p className="text-[11px] font-semibold flex items-center gap-1 mb-1" style={{ color: '#FBBF24' }}>
                <AlertTriangle size={11} /> Posibles efectos secundarios
              </p>
              <p className="text-[11px]" style={{ color: '#A88B2D' }}>{med.side_effects}</p>
              {med.side_effects_treatment && (
                <p className="text-[11px] mt-1 font-medium" style={{ color: '#FBBF24' }}>Solución: {med.side_effects_treatment}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
