import { useState, useEffect } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/dietConfig'
import PatientLayout from '../../components/layout/PatientLayout'
import { Pill, Clock, AlertTriangle, ChevronDown, ChevronUp, Info } from 'lucide-react'

export default function MedsView() {
  const { profile } = useAuth()
  const [meds, setMeds] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => { if (profile?.id) load() }, [profile?.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('nm_medications')
      .select('*')
      .eq('patient_id', profile.id)
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: false })
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
        <div className="card text-center py-16">
          <Pill size={40} className="mx-auto text-gray-200 mb-3" />
          <p className="text-sm text-gray-400">No tienes medicación asignada</p>
        </div>
      ) : (
        <>
          {/* Active */}
          {activeMeds.length > 0 && (
            <div className="mb-6">
              <p className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <Pill size={14} className="text-purple-500" />
                Medicación activa ({activeMeds.length})
              </p>
              <div className="space-y-2">
                {activeMeds.map(med => (
                  <MedCard key={med.id} med={med} expanded={expanded === med.id} onToggle={() => setExpanded(expanded === med.id ? null : med.id)} />
                ))}
              </div>
            </div>
          )}

          {/* Inactive */}
          {inactiveMeds.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-gray-400 mb-2">Anteriores</p>
              <div className="space-y-2 opacity-60">
                {inactiveMeds.map(med => (
                  <MedCard key={med.id} med={med} expanded={expanded === med.id} onToggle={() => setExpanded(expanded === med.id ? null : med.id)} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="mt-6 p-4 rounded-xl bg-amber-50 border border-amber-200">
        <div className="flex gap-2">
          <Info size={14} className="text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700">La medicación es prescrita y ajustada por tu profesional. No modifiques dosis sin consultar.</p>
        </div>
      </div>
    </PatientLayout>
  )
}

function MedCard({ med, expanded, onToggle }) {
  return (
    <div className="card !p-0 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 p-3 text-left">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${med.is_active ? 'bg-purple-50' : 'bg-gray-50'}`}>
          <Pill size={16} className={med.is_active ? 'text-purple-500' : 'text-gray-300'} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{med.medication_name}</p>
          <p className="text-[11px] text-gray-400">{[med.dosage, med.frequency].filter(Boolean).join(' · ')}</p>
        </div>
        {med.clicks && (
          <span className="badge bg-purple-50 text-purple-600 shrink-0">{med.clicks} clicks</span>
        )}
        {expanded ? <ChevronUp size={14} className="text-gray-300" /> : <ChevronDown size={14} className="text-gray-300" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-0 space-y-2 border-t border-gray-50">
          <div className="grid grid-cols-2 gap-2 mt-2">
            {med.start_date && (
              <div className="text-[11px]">
                <span className="text-gray-400 flex items-center gap-1"><Clock size={10} /> Inicio</span>
                <span className="text-gray-700 font-medium">{formatDate(med.start_date)}</span>
              </div>
            )}
            {med.end_date && (
              <div className="text-[11px]">
                <span className="text-gray-400">Fin previsto</span>
                <span className="text-gray-700 font-medium">{formatDate(med.end_date)}</span>
              </div>
            )}
          </div>

          {med.side_effects && (
            <div className="rounded-lg bg-amber-50 p-2.5">
              <p className="text-[11px] font-semibold text-amber-700 flex items-center gap-1 mb-1">
                <AlertTriangle size={11} /> Posibles efectos secundarios
              </p>
              <p className="text-[11px] text-amber-600">{med.side_effects}</p>
              {med.side_effects_treatment && (
                <p className="text-[11px] text-amber-700 mt-1 font-medium">Solución: {med.side_effects_treatment}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
