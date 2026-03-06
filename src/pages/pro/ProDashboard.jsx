import { useState, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'
import { getDietConfig, formatDate, getDaysRemaining } from '../../lib/dietConfig'
import ProLayout from '../../components/layout/ProLayout'
import { Search, UserPlus, Users, Scale, Pill, Clock, ChevronRight, AlertTriangle, Filter, TrendingDown, CalendarClock, Check, X } from 'lucide-react'

export default function ProDashboard() {
  const { profile } = useAuth()
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // all | active | expiring | blocked

  useEffect(() => { if (profile?.id) load() }, [profile?.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('nm_patients')
      .select('*, nm_diet_plans(diet_type, day_of_week, is_active), nm_medications(id, is_active), nm_weight_records(weight, date)')
      .eq('professional_id', profile.id)
      .order('updated_at', { ascending: false })
    setPatients(data || [])
    setLoading(false)
  }

  async function updateAppointment(patientId, isoDate) {
    await supabase
      .from('nm_patients')
      .update({ next_appointment: isoDate || null })
      .eq('id', patientId)
    setPatients(prev => prev.map(p =>
      p.id === patientId ? { ...p, next_appointment: isoDate || null } : p
    ))
  }

  const filtered = useMemo(() => {
    let list = patients
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(p => p.full_name?.toLowerCase().includes(q) || p.phone?.includes(q) || p.email?.toLowerCase().includes(q))
    }
    if (filter === 'active') list = list.filter(p => !p.is_blocked && p.code_expiry && new Date(p.code_expiry) > new Date())
    if (filter === 'expiring') list = list.filter(p => { const d = getDaysRemaining(p.code_expiry); return d !== null && d > 0 && d <= 7 })
    if (filter === 'blocked') list = list.filter(p => p.is_blocked)
    return list
  }, [patients, search, filter])

  // Stats
  const totalActive = patients.filter(p => !p.is_blocked && p.code_expiry && new Date(p.code_expiry) > new Date()).length
  const totalExpiring = patients.filter(p => { const d = getDaysRemaining(p.code_expiry); return d !== null && d > 0 && d <= 7 }).length
  const totalMeds = patients.reduce((sum, p) => sum + (p.nm_medications?.filter(m => m.is_active)?.length || 0), 0)

  return (
    <ProLayout title="Pacientes">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard icon={<Users size={18} />} label="Total" value={patients.length} color="text-[#94A3B8]" bg="bg-[#1F232B]" />
        <StatCard icon={<Scale size={18} />} label="Activos" value={totalActive} color="text-[#2DD4BF]" bg="bg-[rgba(45,212,191,0.08)]" />
        <StatCard icon={<Clock size={18} />} label="Por expirar" value={totalExpiring} color="text-[#E9A820]" bg="bg-[rgba(251,191,36,0.04)]" />
        <StatCard icon={<Pill size={18} />} label="Medicaciones" value={totalMeds} color="text-[#C084FC]" bg="bg-[rgba(192,132,252,0.06)]" />
      </div>

      {/* Search + filter bar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#333A45]" />
          <input
            type="text"
            placeholder="Buscar por nombre, teléfono o email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input !pl-10 w-full"
          />
        </div>
        <div className="flex gap-1.5">
          {[
            { key: 'all', label: 'Todos' },
            { key: 'active', label: 'Activos' },
            { key: 'expiring', label: 'Expirar' },
            { key: 'blocked', label: 'Bloqueados' },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${filter === f.key ? 'bg-[var(--color-brand)] text-white' : 'bg-[#252A33] text-[#64748B] hover:bg-gray-200'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Link to="/pro/patient/new" className="btn btn-primary btn-sm shrink-0">
          <UserPlus size={14} /> Nuevo
        </Link>
      </div>

      {/* Patient list */}
      {loading ? (
        <div className="flex justify-center py-20"><div className="loader" /></div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-16">
          <Users size={40} className="mx-auto text-[#2A2F38] mb-3" />
          <p className="text-sm text-[#4A5568]">{search ? 'Sin resultados para la búsqueda' : 'No hay pacientes registrados'}</p>
          <Link to="/pro/patient/new" className="btn btn-primary btn-sm mt-4 inline-flex">
            <UserPlus size={14} /> Añadir paciente
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(patient => (
            <PatientRow key={patient.id} patient={patient} onUpdateAppointment={updateAppointment} />
          ))}
        </div>
      )}
    </ProLayout>
  )
}

function StatCard({ icon, label, value, color, bg }) {
  return (
    <div className="card !p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center ${color}`}>{icon}</div>
      <div>
        <p className="text-2xl font-bold text-[#F1F5F9]">{value}</p>
        <p className="text-xs text-[#4A5568]">{label}</p>
      </div>
    </div>
  )
}

function PatientRow({ patient, onUpdateAppointment }) {
  const activeDiets = patient.nm_diet_plans?.filter(d => d.is_active) || []
  const activeMeds = patient.nm_medications?.filter(m => m.is_active)?.length || 0
  const weights = patient.nm_weight_records || []
  const latestWeight = weights.length > 0 ? weights.sort((a, b) => b.date.localeCompare(a.date))[0] : null
  const daysLeft = getDaysRemaining(patient.code_expiry)
  const isExpired = daysLeft !== null && daysLeft <= 0
  const isExpiring = daysLeft !== null && daysLeft > 0 && daysLeft <= 7

  // ── Estado del picker de próxima cita ─────────────────────────────────
  const [pickerOpen, setPickerOpen]   = useState(false)
  const [pickerValue, setPickerValue] = useState('')
  const [saving, setSaving]           = useState(false)
  const pickerRef = useRef(null)

  function openPicker(e) {
    e.preventDefault(); e.stopPropagation()
    const current = patient.next_appointment
      ? new Date(patient.next_appointment).toISOString().slice(0, 16)
      : ''
    setPickerValue(current)
    setPickerOpen(true)
  }

  function closePicker(e) {
    e?.preventDefault(); e?.stopPropagation()
    setPickerOpen(false)
  }

  async function saveAppointment(e) {
    e.preventDefault(); e.stopPropagation()
    setSaving(true)
    try {
      await onUpdateAppointment(
        patient.id,
        pickerValue ? new Date(pickerValue).toISOString() : null
      )
    } finally {
      setSaving(false)
      setPickerOpen(false)
    }
  }

  // Calcular color y label del badge de próxima cita
  const appt = patient.next_appointment
  let apptBadge = null
  if (appt) {
    const diffMs  = new Date(appt) - new Date()
    const diffDays = Math.ceil(diffMs / 86400000)
    if (diffMs <= 0) {
      apptBadge = { label: 'Cita pasada', color: '#FB7185', bg: 'rgba(251,113,133,0.08)' }
    } else if (diffDays <= 7) {
      apptBadge = { label: `${diffDays}d`, color: '#FBBF24', bg: 'rgba(251,191,36,0.08)' }
    } else {
      apptBadge = { label: `${diffDays}d`, color: '#2DD4BF', bg: 'rgba(45,212,191,0.08)' }
    }
  }

  // Unique diet types for this patient
  const dietTypes = [...new Set(activeDiets.map(d => d.diet_type))]

  // Texto legible de la cita actual
  const apptReadable = appt
    ? new Date(appt).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="card !p-0 transition group" style={{ borderRadius: 16 }}>

      {/* ── FILA 1: datos del paciente ───────────────────────────────── */}
      <Link to={`/pro/patient/${patient.id}`}
        className="flex items-center gap-3 px-3 pt-3 pb-2 cursor-pointer"
      >
        <div className="w-10 h-10 rounded-full bg-[rgba(45,212,191,0.08)] flex items-center justify-center text-sm font-bold text-[var(--color-brand)] shrink-0">
          {patient.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-semibold text-[#E2E8F0] truncate">{patient.full_name}</p>
            {patient.is_blocked && <span className="badge bg-[rgba(248,113,113,0.06)] text-[#FB7185] text-[10px]">Bloqueado</span>}
            {isExpiring && <span className="badge bg-[rgba(251,191,36,0.04)] text-[#E9A820] text-[10px]">{daysLeft}d</span>}
            {isExpired && <span className="badge bg-[rgba(248,113,113,0.06)] text-[#FB7185] text-[10px]">Expirado</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {latestWeight && (
              <span className="text-[11px] text-[#4A5568] flex items-center gap-1">
                <Scale size={9} /> {Number(latestWeight.weight).toFixed(1)} kg
              </span>
            )}
            {activeMeds > 0 && (
              <span className="text-[11px] text-[#4A5568] flex items-center gap-1">
                <Pill size={9} /> {activeMeds}
              </span>
            )}
            {dietTypes.slice(0, 2).map(dt => {
              const cfg = getDietConfig(dt)
              return (
                <span key={dt} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: cfg?.bg, color: cfg?.color }}>
                  {cfg?.label || dt}
                </span>
              )
            })}
          </div>
        </div>

        <ChevronRight size={15} className="text-[#333A45] group-hover:text-[var(--color-brand)] transition shrink-0" />
      </Link>

      {/* ── FILA 2: próxima consulta — siempre visible ───────────────── */}
      <div
        className="flex items-center gap-2 px-3 pb-2.5"
        style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
        onClick={e => { e.preventDefault(); e.stopPropagation() }}
      >
        <CalendarClock size={13} style={{ color: appt ? (apptBadge?.color || '#2DD4BF') : '#4A5568', flexShrink: 0 }} />

        {/* Sin picker abierto */}
        {!pickerOpen && (
          <>
            {apptReadable ? (
              <span className="text-[11px] font-semibold flex-1 truncate"
                style={{ color: apptBadge?.color || '#2DD4BF' }}>
                {apptReadable}
              </span>
            ) : (
              <span className="text-[11px] text-[#4A5568] flex-1">Sin próxima consulta</span>
            )}
            <button
              onClick={openPicker}
              className="text-[10px] font-semibold px-2.5 py-1 rounded-lg shrink-0 transition"
              style={{
                background: appt ? 'rgba(45,212,191,0.10)' : 'rgba(100,116,139,0.18)',
                border: `1px solid ${appt ? 'rgba(45,212,191,0.30)' : 'rgba(100,116,139,0.30)'}`,
                color: appt ? '#2DD4BF' : '#94A3B8',
              }}
            >
              {appt ? 'Cambiar' : '+ Fijar cita'}
            </button>
          </>
        )}

        {/* Con picker abierto */}
        {pickerOpen && (
          <div className="flex items-center gap-1.5 flex-1 flex-wrap"
            onClick={e => { e.preventDefault(); e.stopPropagation() }}>
            <input
              ref={pickerRef}
              type="datetime-local"
              value={pickerValue}
              onChange={e => setPickerValue(e.target.value)}
              onClick={e => { e.preventDefault(); e.stopPropagation() }}
              className="flex-1 rounded-lg px-2 py-1 outline-none"
              style={{
                background: '#1A1E26',
                border: '1px solid #2DD4BF50',
                color: '#CBD5E1',
                colorScheme: 'dark',
                fontSize: 11,
                minWidth: 0,
              }}
            />
            <button onClick={saveAppointment} disabled={saving}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold shrink-0"
              style={{ background: 'rgba(45,212,191,0.15)', color: '#2DD4BF', border: '1px solid rgba(45,212,191,0.3)' }}>
              {saving ? '...' : <><Check size={11} /> Guardar</>}
            </button>
            <button onClick={closePicker}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold shrink-0"
              style={{ background: 'rgba(248,113,113,0.10)', color: '#FB7185', border: '1px solid rgba(248,113,113,0.25)' }}>
              <X size={11} />
            </button>
          </div>
        )}
      </div>

    </div>
  )
}
