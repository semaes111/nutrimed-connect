import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'
import { getDietConfig, DAYS_ORDER, DAY_LABELS, formatDate, formatDateShort, getDaysRemaining } from '../../lib/dietConfig'
import ProLayout from '../../components/layout/ProLayout'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import {
  ArrowLeft, Edit, Scale, Target, Pill, Calendar, User, Heart, Brain,
  Plus, Trash2, Save, Key, Copy, Lock, Unlock, AlertTriangle, Check,
  TrendingDown, Phone, Mail, Clock, Activity, ChevronDown, ChevronUp
} from 'lucide-react'

const TABS = [
  { key: 'overview', label: 'General' },
  { key: 'diet', label: 'Dietas' },
  { key: 'weight', label: 'Peso' },
  { key: 'meds', label: 'Medicación' },
  { key: 'access', label: 'Acceso' },
]

export default function ProPatientDetail() {
  const { id } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [patient, setPatient] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')

  useEffect(() => { if (id) load() }, [id])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('nm_patients')
      .select('*')
      .eq('id', id)
      .single()
    setPatient(data)
    setLoading(false)
  }

  if (loading) return <ProLayout><div className="flex justify-center py-20"><div className="loader" /></div></ProLayout>
  if (!patient) return <ProLayout><div className="card text-center py-20"><p className="text-gray-400">Paciente no encontrado</p></div></ProLayout>

  const daysLeft = getDaysRemaining(patient.code_expiry)

  return (
    <ProLayout>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/pro')} className="btn btn-secondary !p-2 !rounded-xl">
            <ArrowLeft size={18} />
          </button>
          <div className="w-14 h-14 rounded-2xl bg-teal-50 flex items-center justify-center text-lg font-bold text-[var(--color-brand)]">
            {patient.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>{patient.full_name}</h1>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
              {patient.phone && <span className="flex items-center gap-1"><Phone size={11} /> {patient.phone}</span>}
              {patient.email && <span className="flex items-center gap-1"><Mail size={11} /> {patient.email}</span>}
              {patient.age && <span>{patient.age} años</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {patient.is_blocked && <span className="badge bg-red-50 text-red-500">Bloqueado</span>}
          {daysLeft !== null && daysLeft <= 7 && daysLeft > 0 && <span className="badge bg-amber-50 text-amber-600">{daysLeft} días</span>}
          <Link to={`/pro/patient/${id}/edit`} className="btn btn-primary btn-sm">
            <Edit size={14} /> Editar
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-100 pb-px">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition ${tab === t.key ? 'bg-teal-50 text-[var(--color-brand)] border-b-2 border-[var(--color-brand)]' : 'text-gray-400 hover:text-gray-600'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="page-enter">
        {tab === 'overview' && <OverviewTab patient={patient} />}
        {tab === 'diet' && <DietTab patient={patient} professionalId={profile?.id} onUpdate={load} />}
        {tab === 'weight' && <WeightTab patient={patient} />}
        {tab === 'meds' && <MedsTab patient={patient} onUpdate={load} />}
        {tab === 'access' && <AccessTab patient={patient} onUpdate={load} />}
      </div>
    </ProLayout>
  )
}

/* ============== OVERVIEW TAB ============== */
function OverviewTab({ patient }) {
  const fam = patient.family_history || {}
  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Weight info */}
      <div className="card">
        <p className="text-xs font-semibold text-gray-500 mb-3 flex items-center gap-2"><Scale size={14} /> Peso</p>
        <div className="grid grid-cols-2 gap-3">
          <InfoItem label="Actual" value={patient.current_weight ? `${patient.current_weight} kg` : '—'} />
          <InfoItem label="Inicial" value={patient.initial_weight ? `${patient.initial_weight} kg` : '—'} />
          <InfoItem label="Objetivo" value={patient.target_weight ? `${patient.target_weight} kg` : '—'} />
          <InfoItem label="Mejor 5 años" value={patient.best_weight_5_years ? `${patient.best_weight_5_years} kg` : '—'} />
          {patient.height && <InfoItem label="Altura" value={`${patient.height} cm`} />}
        </div>
      </div>

      {/* Psychological */}
      <div className="card">
        <p className="text-xs font-semibold text-gray-500 mb-3 flex items-center gap-2"><Brain size={14} /> Nivel psicológico</p>
        <LevelBar label="Estrés" value={patient.stress_level} color="red" />
        <LevelBar label="Control alimentario" value={patient.food_control_level} color="blue" />
        <LevelBar label="Motivación" value={patient.motivation_level} color="green" />
      </div>

      {/* Medical */}
      <div className="card">
        <p className="text-xs font-semibold text-gray-500 mb-3 flex items-center gap-2"><Heart size={14} /> Historial médico</p>
        <div className="space-y-2 text-sm">
          <InfoItem label="Enfermedades" value={patient.has_diseases ? patient.diseases_description || 'Sí' : 'No'} />
          <InfoItem label="Ejercicio" value={patient.does_exercise ? 'Sí' : 'No'} />
          <InfoItem label="Problemas ginecológicos" value={patient.gynecological_problems ? 'Sí' : 'No'} />
          <InfoItem label="Alergias/Medicamentos" value={patient.allergies_medications || '—'} />
          <InfoItem label="Intolerancias" value={patient.food_intolerances || '—'} />
        </div>
      </div>

      {/* Family history */}
      <div className="card">
        <p className="text-xs font-semibold text-gray-500 mb-3 flex items-center gap-2"><Activity size={14} /> Antecedentes familiares</p>
        <div className="space-y-2">
          <FamilyItem label="Diabetes Tipo 2" active={fam.diabetes_type2} />
          <FamilyItem label="SOP / PCOS" active={fam.pcos} />
          <FamilyItem label="Hipotiroidismo" active={fam.hypothyroidism} />
        </div>
        {patient.notes && (
          <div className="mt-4 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-1">Notas</p>
            <p className="text-sm text-gray-600">{patient.notes}</p>
          </div>
        )}
      </div>

      {/* Dates */}
      <div className="card col-span-2">
        <p className="text-xs font-semibold text-gray-500 mb-3 flex items-center gap-2"><Calendar size={14} /> Fechas</p>
        <div className="flex gap-6">
          <InfoItem label="Registro" value={formatDate(patient.created_at)} />
          <InfoItem label="Última actualización" value={formatDate(patient.updated_at)} />
          <InfoItem label="Doctor asignado" value={patient.assigned_doctor || '—'} />
        </div>
      </div>
    </div>
  )
}

/* ============== DIET TAB ============== */
function DietTab({ patient, professionalId, onUpdate }) {
  const [weeklyDiet, setWeeklyDiet] = useState([])
  const [basePlan, setBasePlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dietas, setDietas] = useState([])
  const [saving, setSaving] = useState(null) // null | 'base' | day string
  const [editingDay, setEditingDay] = useState(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadWeekly(), loadBase(), loadDietas()])
    setLoading(false)
  }

  async function loadWeekly() {
    const { data } = await supabase.rpc('get_patient_weekly_diet', { p_patient_id: patient.id })
    setWeeklyDiet(data || [])
  }

  async function loadBase() {
    const { data } = await supabase
      .from('nm_diet_plans')
      .select('*, dieta_ref:dietas_validas(nombre, slug, nivel_restriccion)')
      .eq('patient_id', patient.id)
      .eq('day_of_week', 'todos')
      .eq('is_active', true)
      .maybeSingle()
    setBasePlan(data || null)
  }

  async function loadDietas() {
    const { data } = await supabase.from('dietas_validas').select('*').eq('activa', true).order('nivel_restriccion', { ascending: false })
    setDietas(data || [])
  }

  async function handleAssignBase(dietSlug) {
    if (!dietSlug) return
    setSaving('base')
    const dieta = dietas.find(d => d.slug === dietSlug)
    if (!dieta) { setSaving(null); return }
    await supabase.rpc('assign_base_diet', {
      p_patient_id: patient.id,
      p_professional_id: professionalId,
      p_dieta_valida_id: dieta.id,
      p_diet_type: dieta.slug,
      p_diet_name: dieta.nombre,
    })
    await Promise.all([loadWeekly(), loadBase()])
    setSaving(null)
  }

  async function handleOverrideDay(day, dietSlug) {
    if (!dietSlug) return
    setSaving(day)
    const dieta = dietas.find(d => d.slug === dietSlug)
    if (!dieta) { setSaving(null); return }
    await supabase.rpc('override_day_diet', {
      p_patient_id: patient.id,
      p_professional_id: professionalId,
      p_dieta_valida_id: dieta.id,
      p_diet_type: dieta.slug,
      p_day_of_week: day,
      p_diet_name: dieta.nombre,
    })
    await loadWeekly()
    setSaving(null)
    setEditingDay(null)
  }

  async function handleRemoveOverride(day) {
    setSaving(day)
    await supabase.rpc('remove_day_override', {
      p_patient_id: patient.id,
      p_day_of_week: day,
    })
    await loadWeekly()
    setSaving(null)
  }

  if (loading) return <div className="flex justify-center py-10"><div className="loader" /></div>

  const baseCfg = basePlan ? getDietConfig(basePlan.diet_type) : null
  const overrideCount = weeklyDiet.filter(d => d.source === 'override').length

  return (
    <div className="space-y-6">
      {/* BASE DIET SELECTOR */}
      <div className="card card--elevated" style={baseCfg ? { borderLeft: `4px solid ${baseCfg.color}`, background: `linear-gradient(135deg, ${baseCfg.bg}44 0%, white 60%)` } : {}}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
              <Calendar size={13} /> Dieta base · Todos los días
            </p>
            {baseCfg && (
              <p className="text-[11px] text-gray-400 mt-0.5">
                Se aplica a los {7 - overrideCount} días sin personalización
              </p>
            )}
          </div>
          {baseCfg && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ backgroundColor: baseCfg.bg, color: baseCfg.color }}>
              {baseCfg.icon} {baseCfg.label}
            </span>
          )}
        </div>

        <select
          value={basePlan?.diet_type || ''}
          onChange={e => handleAssignBase(e.target.value)}
          className="input w-full !py-2.5 text-sm font-medium"
          disabled={saving === 'base'}
        >
          <option value="">— Selecciona dieta base —</option>
          {dietas.map(d => (
            <option key={d.slug} value={d.slug}>{d.nombre} (nivel {d.nivel_restriccion})</option>
          ))}
        </select>

        {!basePlan && (
          <p className="text-xs text-amber-600 mt-2 flex items-center gap-1.5">
            <AlertTriangle size={12} /> Selecciona una dieta base primero. Luego podrás personalizar días sueltos.
          </p>
        )}
      </div>

      {/* WEEKLY GRID */}
      {basePlan && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              Plan semanal
              {overrideCount > 0 && (
                <span className="text-[11px] font-normal text-gray-400">
                  ({overrideCount} {overrideCount === 1 ? 'día personalizado' : 'días personalizados'})
                </span>
              )}
            </p>
          </div>

          <div className="space-y-1.5">
            {DAYS_ORDER.map(day => {
              const dayData = weeklyDiet.find(d => d.day_of_week === day)
              const isOverride = dayData?.source === 'override'
              const cfg = dayData ? getDietConfig(dayData.diet_type) : baseCfg
              const isEditing = editingDay === day
              const isSaving = saving === day

              return (
                <div key={day}>
                  <div
                    className={`card !p-3 flex items-center gap-3 cursor-pointer transition-all hover:shadow-md ${isOverride ? 'ring-1 ring-offset-1' : ''}`}
                    style={isOverride && cfg ? { borderLeft: `3px solid ${cfg.color}`, ringColor: cfg.color + '40' } : {}}
                    onClick={() => setEditingDay(isEditing ? null : day)}
                  >
                    {/* Day name */}
                    <span className="text-sm font-semibold text-gray-700 w-20 shrink-0">{DAY_LABELS[day]}</span>

                    {/* Diet badge */}
                    {cfg && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                        {cfg.icon} {cfg.label}
                      </span>
                    )}

                    {/* Source indicator */}
                    <span className="flex-1" />
                    {isOverride ? (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-50 text-blue-500">Personalizado</span>
                    ) : (
                      <span className="text-[10px] text-gray-300">= base</span>
                    )}

                    {/* Remove override button */}
                    {isOverride && (
                      <button
                        onClick={e => { e.stopPropagation(); handleRemoveOverride(day) }}
                        className="text-gray-300 hover:text-red-400 p-1 transition"
                        title="Quitar personalización (volver a base)"
                        disabled={isSaving}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}

                    <ChevronDown size={14} className={`text-gray-300 transition-transform ${isEditing ? 'rotate-180' : ''}`} />
                  </div>

                  {/* Inline editor */}
                  {isEditing && (
                    <div className="ml-4 mt-1 mb-2 p-3 rounded-xl bg-gray-50 border border-gray-100">
                      <p className="text-[11px] text-gray-400 mb-2">Cambiar dieta del {DAY_LABELS[day].toLowerCase()}:</p>
                      <div className="flex gap-2 flex-wrap">
                        {dietas.map(d => {
                          const dCfg = getDietConfig(d.slug)
                          const isActive = dayData?.diet_type === d.slug
                          const isBase = basePlan?.diet_type === d.slug && !isOverride
                          return (
                            <button
                              key={d.slug}
                              onClick={() => {
                                if (isBase) return // ya es la base, no hacer nada
                                if (d.slug === basePlan?.diet_type && isOverride) {
                                  // Si elige la misma que la base, eliminar override
                                  handleRemoveOverride(day)
                                } else {
                                  handleOverrideDay(day, d.slug)
                                }
                              }}
                              disabled={isSaving || isBase}
                              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                                isActive
                                  ? 'ring-2 ring-offset-1 shadow-sm'
                                  : isBase
                                    ? 'opacity-50 cursor-default'
                                    : 'hover:shadow-sm hover:scale-[1.03]'
                              }`}
                              style={{
                                backgroundColor: isActive ? dCfg.color + '18' : dCfg.bg,
                                color: dCfg.color,
                                borderColor: isActive ? dCfg.color : 'transparent',
                                ringColor: isActive ? dCfg.color : undefined,
                              }}
                              title={isBase ? 'Es la dieta base actual' : d.nombre}
                            >
                              {dCfg.icon} {dCfg.label}
                              {isBase && <span className="text-[9px] ml-0.5 opacity-60">(base)</span>}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/* ============== WEIGHT TAB ============== */
function WeightTab({ patient }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newWeight, setNewWeight] = useState('')
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0])
  const [newNote, setNewNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadRecords() }, [])

  async function loadRecords() {
    setLoading(true)
    const { data } = await supabase
      .from('nm_weight_records')
      .select('*')
      .eq('patient_id', patient.id)
      .order('date', { ascending: true })
    setRecords(data || [])
    setLoading(false)
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!newWeight || !newDate) return
    setSaving(true)
    await supabase.from('nm_weight_records').insert({
      patient_id: patient.id, weight: parseFloat(newWeight), date: newDate, notes: newNote || null, recorded_by: 'professional'
    })
    await supabase.from('nm_patients').update({ current_weight: parseFloat(newWeight) }).eq('id', patient.id)
    setNewWeight(''); setNewNote(''); setShowAdd(false); setSaving(false)
    loadRecords()
  }

  async function handleDelete(recordId) {
    if (!confirm('¿Eliminar este registro?')) return
    await supabase.from('nm_weight_records').delete().eq('id', recordId)
    loadRecords()
  }

  const chartData = records.map(r => ({ date: formatDateShort(r.date), peso: Number(r.weight) }))
  const target = patient.target_weight ? Number(patient.target_weight) : null
  const initial = patient.initial_weight ? Number(patient.initial_weight) : null
  const latest = records.length > 0 ? Number(records[records.length - 1].weight) : null
  const totalChange = initial && latest ? (initial - latest).toFixed(1) : null

  // Y-axis domain must include target + initial so reference lines are visible
  const allValues = chartData.map(d => d.peso)
  if (target) allValues.push(target)
  if (initial) allValues.push(initial)
  const yMin = allValues.length > 0 ? Math.floor(Math.min(...allValues) - 2) : 'auto'
  const yMax = allValues.length > 0 ? Math.ceil(Math.max(...allValues) + 2) : 'auto'

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-4">
          {latest && <span className="text-sm text-gray-500">Actual: <strong className="text-gray-800">{latest.toFixed(1)} kg</strong></span>}
          {totalChange && Number(totalChange) > 0 && <span className="text-sm text-emerald-600 flex items-center gap-1"><TrendingDown size={14} /> -{totalChange} kg</span>}
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="btn btn-primary btn-sm"><Plus size={14} /> Registrar</button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="card card--elevated mb-4 flex items-end gap-3">
          <div className="flex-1">
            <label className="text-xs text-gray-500">Peso (kg)</label>
            <input type="number" step="0.1" min="30" max="300" className="input w-full" value={newWeight} onChange={e => setNewWeight(e.target.value)} required />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-500">Fecha</label>
            <input type="date" className="input w-full" value={newDate} onChange={e => setNewDate(e.target.value)} required />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-500">Nota</label>
            <input type="text" className="input w-full" value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Opcional" />
          </div>
          <button type="submit" disabled={saving} className="btn btn-primary btn-sm">{saving ? '...' : 'Guardar'}</button>
        </form>
      )}

      {loading ? <div className="flex justify-center py-10"><div className="loader" /></div> : chartData.length > 1 ? (
        <div className="card card--elevated mb-4">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94A3B8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} domain={[yMin, yMax]} />
              <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,.1)', fontSize: 13 }} formatter={v => [`${v} kg`, 'Peso']} />
              <Line type="monotone" dataKey="peso" stroke="#0D9488" strokeWidth={2.5} dot={{ fill: '#0D9488', r: 3 }} activeDot={{ r: 5 }} />
              {target && <ReferenceLine y={target} stroke="#3B82F6" strokeDasharray="5 5" label={{ value: `Obj: ${target}`, position: 'right', fontSize: 10, fill: '#3B82F6' }} />}
              {initial && <ReferenceLine y={initial} stroke="#EF4444" strokeDasharray="3 3" label={{ value: `Ini: ${initial}`, position: 'left', fontSize: 10, fill: '#EF4444' }} />}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="card text-center py-10"><p className="text-sm text-gray-400">Registra pesos para ver la gráfica</p></div>
      )}

      {records.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">Historial ({records.length})</p>
          <div className="space-y-1">
            {[...records].reverse().map(r => (
              <div key={r.id} className="card !p-2.5 flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold text-gray-800">{Number(r.weight).toFixed(1)} kg</span>
                  <span className="text-xs text-gray-400 ml-2">{formatDate(r.date)}</span>
                  {r.notes && <span className="text-xs text-gray-300 ml-2">{r.notes}</span>}
                  <span className="text-[10px] text-gray-300 ml-2">{r.recorded_by === 'patient' ? 'Paciente' : 'Doctor'}</span>
                </div>
                <button onClick={() => handleDelete(r.id)} className="text-gray-300 hover:text-red-400 transition p-1"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ============== MEDS TAB ============== */
function MedsTab({ patient, onUpdate }) {
  const [meds, setMeds] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ medication_name: '', dosage: '', frequency: '', clicks: '', start_date: '', end_date: '', side_effects: '', side_effects_treatment: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadMeds() }, [])

  async function loadMeds() {
    setLoading(true)
    const { data } = await supabase.from('nm_medications').select('*').eq('patient_id', patient.id).order('is_active', { ascending: false }).order('created_at', { ascending: false })
    setMeds(data || [])
    setLoading(false)
  }

  async function handleAdd(e) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('nm_medications').insert({
      patient_id: patient.id,
      medication_name: form.medication_name,
      dosage: form.dosage || null,
      frequency: form.frequency || null,
      clicks: form.clicks ? parseInt(form.clicks) : null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      side_effects: form.side_effects || null,
      side_effects_treatment: form.side_effects_treatment || null,
      is_active: true,
    })
    setForm({ medication_name: '', dosage: '', frequency: '', clicks: '', start_date: '', end_date: '', side_effects: '', side_effects_treatment: '' })
    setShowAdd(false); setSaving(false)
    loadMeds()
  }

  async function toggleActive(med) {
    await supabase.from('nm_medications').update({ is_active: !med.is_active }).eq('id', med.id)
    loadMeds()
  }

  async function deleteMed(med) {
    if (!confirm(`¿Eliminar ${med.medication_name}?`)) return
    await supabase.from('nm_medications').delete().eq('id', med.id)
    loadMeds()
  }

  const activeMeds = meds.filter(m => m.is_active)
  const inactiveMeds = meds.filter(m => !m.is_active)

  return (
    <div>
      <div className="flex justify-between mb-4">
        <p className="text-sm text-gray-500">Medicación activa: {activeMeds.length}</p>
        <button onClick={() => setShowAdd(!showAdd)} className="btn btn-primary btn-sm"><Plus size={14} /> Añadir</button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="card card--elevated mb-4 space-y-3">
          <p className="text-sm font-semibold text-gray-800">Nueva medicación</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500">Nombre *</label>
              <input className="input w-full" value={form.medication_name} onChange={e => setForm({ ...form, medication_name: e.target.value })} required />
            </div>
            <div>
              <label className="text-xs text-gray-500">Dosis</label>
              <input className="input w-full" value={form.dosage} onChange={e => setForm({ ...form, dosage: e.target.value })} placeholder="Ej: 500mg" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Frecuencia</label>
              <input className="input w-full" value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })} placeholder="Ej: 1/día" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Clicks</label>
              <input type="number" className="input w-full" value={form.clicks} onChange={e => setForm({ ...form, clicks: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Inicio</label>
              <input type="date" className="input w-full" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Fin</label>
              <input type="date" className="input w-full" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">Efectos secundarios</label>
              <input className="input w-full" value={form.side_effects} onChange={e => setForm({ ...form, side_effects: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Solución efectos secundarios</label>
              <input className="input w-full" value={form.side_effects_treatment} onChange={e => setForm({ ...form, side_effects_treatment: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowAdd(false)} className="btn btn-secondary btn-sm">Cancelar</button>
            <button type="submit" disabled={saving || !form.medication_name} className="btn btn-primary btn-sm">{saving ? '...' : 'Guardar'}</button>
          </div>
        </form>
      )}

      {loading ? <div className="flex justify-center py-10"><div className="loader" /></div> : meds.length === 0 ? (
        <div className="card text-center py-10"><Pill size={32} className="mx-auto text-gray-200 mb-2" /><p className="text-sm text-gray-400">Sin medicación</p></div>
      ) : (
        <>
          {activeMeds.length > 0 && (
            <div className="space-y-2 mb-4">
              {activeMeds.map(med => <MedRow key={med.id} med={med} onToggle={toggleActive} onDelete={deleteMed} />)}
            </div>
          )}
          {inactiveMeds.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-2">Inactivas</p>
              <div className="space-y-2 opacity-60">
                {inactiveMeds.map(med => <MedRow key={med.id} med={med} onToggle={toggleActive} onDelete={deleteMed} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function MedRow({ med, onToggle, onDelete }) {
  return (
    <div className="card !p-3 flex items-center gap-3">
      <Pill size={16} className={med.is_active ? 'text-purple-500' : 'text-gray-300'} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800">{med.medication_name}</p>
        <p className="text-[11px] text-gray-400">{[med.dosage, med.frequency, med.clicks ? `${med.clicks} clicks` : null].filter(Boolean).join(' · ')}</p>
      </div>
      {med.side_effects && <AlertTriangle size={14} className="text-amber-400 shrink-0" title={med.side_effects} />}
      <button onClick={() => onToggle(med)} className={`text-xs px-2 py-1 rounded-lg ${med.is_active ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'} transition`}>
        {med.is_active ? 'Desactivar' : 'Activar'}
      </button>
      <button onClick={() => onDelete(med)} className="text-gray-300 hover:text-red-400 p-1"><Trash2 size={13} /></button>
    </div>
  )
}

/* ============== ACCESS TAB ============== */
function AccessTab({ patient, onUpdate }) {
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let code = ''
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)]
    return code
  }

  async function handleGenerate() {
    setSaving(true)
    const code = generateCode()
    const expiry = new Date()
    expiry.setDate(expiry.getDate() + 28)

    // Update patient
    await supabase.from('nm_patients').update({
      access_code: code,
      code_expiry: expiry.toISOString(),
      is_blocked: false,
    }).eq('id', patient.id)

    // Also upsert nm_access_codes
    await supabase.from('nm_access_codes').upsert({
      patient_id: patient.id,
      access_code: code,
      code_expiry: expiry.toISOString(),
      is_blocked: false,
    }, { onConflict: 'patient_id' })

    setSaving(false)
    onUpdate()
  }

  async function handleToggleBlock() {
    setSaving(true)
    const newBlocked = !patient.is_blocked
    await supabase.from('nm_patients').update({ is_blocked: newBlocked }).eq('id', patient.id)
    await supabase.from('nm_access_codes').update({ is_blocked: newBlocked }).eq('patient_id', patient.id)
    setSaving(false)
    onUpdate()
  }

  async function handleCopy() {
    if (!patient.access_code) return
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(patient.access_code)
      } else {
        const ta = document.createElement('textarea')
        ta.value = patient.access_code
        ta.style.cssText = 'position:fixed;left:-9999px'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Last resort: select the code text so user can Ctrl+C
      const el = document.querySelector('[data-code]')
      if (el) { const range = document.createRange(); range.selectNodeContents(el); window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range) }
    }
  }

  const daysLeft = getDaysRemaining(patient.code_expiry)

  return (
    <div className="max-w-lg">
      <div className="card card--elevated">
        <p className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2"><Key size={16} /> Código de acceso del paciente</p>

        {patient.access_code ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div data-code className="flex-1 bg-gray-50 rounded-xl px-4 py-3 font-mono text-2xl tracking-[0.3em] text-center font-bold text-gray-800 select-all">
                {patient.access_code}
              </div>
              <button onClick={handleCopy} className="btn btn-secondary !p-3 !rounded-xl" title="Copiar">
                {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
              </button>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Expira: <strong className="text-gray-600">{formatDate(patient.code_expiry)}</strong></span>
              {daysLeft !== null && (
                <span className={`badge ${daysLeft <= 0 ? 'bg-red-50 text-red-500' : daysLeft <= 7 ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'}`}>
                  {daysLeft <= 0 ? 'Expirado' : `${daysLeft} días`}
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={handleGenerate} disabled={saving} className="btn btn-primary btn-sm flex-1">
                <Key size={14} /> {saving ? '...' : 'Regenerar código (28d)'}
              </button>
              <button onClick={handleToggleBlock} disabled={saving} className={`btn btn-sm flex-1 ${patient.is_blocked ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-red-50 text-red-500 hover:bg-red-100'}`}>
                {patient.is_blocked ? <><Unlock size={14} /> Desbloquear</> : <><Lock size={14} /> Bloquear</>}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <Key size={32} className="mx-auto text-gray-200 mb-3" />
            <p className="text-sm text-gray-400 mb-4">Sin código de acceso generado</p>
            <button onClick={handleGenerate} disabled={saving} className="btn btn-primary btn-sm">
              <Key size={14} /> {saving ? 'Generando...' : 'Generar código (28 días)'}
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 p-4 rounded-xl bg-blue-50 border border-blue-100">
        <p className="text-xs text-blue-700">El paciente introduce este código en la pantalla de acceso de la app para ver su dieta, peso y medicación. El código caduca automáticamente a los 28 días.</p>
      </div>
    </div>
  )
}

/* ============== HELPER COMPONENTS ============== */
function InfoItem({ label, value }) {
  return (
    <div>
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className="text-sm text-gray-700 font-medium">{value}</p>
    </div>
  )
}

function FamilyItem({ label, active }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-5 h-5 rounded-md flex items-center justify-center ${active ? 'bg-red-50' : 'bg-gray-50'}`}>
        {active ? <Check size={12} className="text-red-500" /> : <span className="text-gray-300 text-xs">—</span>}
      </div>
      <span className={`text-sm ${active ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>{label}</span>
    </div>
  )
}

function LevelBar({ label, value, color }) {
  const colors = { red: 'bg-red-400', blue: 'bg-blue-400', green: 'bg-emerald-400' }
  const v = value || 0
  return (
    <div className="mb-3">
      <div className="flex justify-between mb-1">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-xs font-bold text-gray-700">{v}/10</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colors[color]} transition-all`} style={{ width: `${v * 10}%` }} />
      </div>
    </div>
  )
}
