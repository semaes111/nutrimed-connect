import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'
import ProLayout from '../../components/layout/ProLayout'
import {
  ArrowLeft, Save, User, Scale, Heart, Brain, Pill, AlertTriangle,
  Phone, Mail, Ruler, Calendar, Activity, FileText, Loader
} from 'lucide-react'

const INITIAL_STATE = {
  full_name: '',
  assigned_doctor: '',
  age: '',
  height: '',
  phone: '',
  email: '',
  current_weight: '',
  initial_weight: '',
  best_weight_5_years: '',
  target_weight: '',
  has_diseases: false,
  diseases_description: '',
  does_exercise: false,
  gynecological_problems: false,
  family_history: { diabetes_type2: false, pcos: false, hypothyroidism: false },
  allergies_medications: '',
  food_intolerances: '',
  stress_level: 5,
  food_control_level: 5,
  motivation_level: 5,
  notes: '',
}

function SliderField({ label, icon: Icon, value, onChange, color, description }) {
  const colorMap = {
    red: { track: 'bg-[rgba(248,113,113,0.06)]0', bg: 'bg-[rgba(248,113,113,0.06)]', text: 'text-[#FCA5A5]' },
    amber: { track: 'bg-[rgba(251,191,36,0.04)]0', bg: 'bg-[rgba(251,191,36,0.04)]', text: 'text-[#E9A820]' },
    emerald: { track: 'bg-[rgba(52,211,153,0.06)]0', bg: 'bg-[rgba(52,211,153,0.06)]', text: 'text-[#34D399]' },
  }
  const c = colorMap[color] || colorMap.emerald
  const levelLabel = value <= 3 ? 'Bajo' : value <= 6 ? 'Medio' : 'Alto'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-[#CBD5E1] flex items-center gap-2">
          <Icon size={15} className="text-[#4A5568]" />
          {label}
        </label>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>
          {value}/10 — {levelLabel}
        </span>
      </div>
      {description && <p className="text-xs text-[#4A5568]">{description}</p>}
      <input
        type="range" min="0" max="10" value={value} onChange={e => onChange(parseInt(e.target.value))}
        className="w-full h-2 bg-[#252A33] rounded-full appearance-none cursor-pointer accent-[var(--color-brand)]"
      />
      <div className="flex justify-between text-[10px] text-[#333A45]">
        <span>0</span><span>5</span><span>10</span>
      </div>
    </div>
  )
}

function SectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-center gap-3 mb-4 pt-2">
      <div className="w-9 h-9 rounded-xl bg-[rgba(45,212,191,0.08)] flex items-center justify-center">
        <Icon size={17} className="text-[var(--color-brand)]" />
      </div>
      <div>
        <h3 className="font-semibold text-[#F1F5F9] text-sm">{title}</h3>
        {subtitle && <p className="text-xs text-[#4A5568]">{subtitle}</p>}
      </div>
    </div>
  )
}

function InputField({ label, icon: Icon, type = 'text', value, onChange, placeholder, required, suffix, className = '' }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-[#64748B] mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <div className="relative">
        {Icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#333A45]">
            <Icon size={15} />
          </div>
        )}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className={`input w-full ${Icon ? '!pl-9' : ''} ${suffix ? '!pr-12' : ''}`}
          step={type === 'number' ? '0.1' : undefined}
          min={type === 'number' ? '0' : undefined}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#4A5568] font-medium">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

function Toggle({ label, checked, onChange, description }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 mt-0.5 ${checked ? 'bg-[var(--color-brand)]' : 'bg-gray-200'}`}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-[#262B34] shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only" />
      </div>
      <div>
        <span className="text-sm text-[#CBD5E1] font-medium group-hover:text-[#F1F5F9] transition-colors">{label}</span>
        {description && <p className="text-xs text-[#4A5568] mt-0.5">{description}</p>}
      </div>
    </label>
  )
}

export default function ProPatientForm() {
  const { id } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const [form, setForm] = useState(INITIAL_STATE)
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (isEdit && id) loadPatient()
  }, [id])

  async function loadPatient() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('nm_patients')
      .select('*')
      .eq('id', id)
      .single()

    if (err || !data) {
      setError('No se pudo cargar el paciente')
      setLoading(false)
      return
    }

    setForm({
      full_name: data.full_name || '',
      assigned_doctor: data.assigned_doctor || '',
      age: data.age ?? '',
      height: data.height ?? '',
      phone: data.phone || '',
      email: data.email || '',
      current_weight: data.current_weight ?? '',
      initial_weight: data.initial_weight ?? '',
      best_weight_5_years: data.best_weight_5_years ?? '',
      target_weight: data.target_weight ?? '',
      has_diseases: data.has_diseases || false,
      diseases_description: data.diseases_description || '',
      does_exercise: data.does_exercise || false,
      gynecological_problems: data.gynecological_problems || false,
      family_history: data.family_history || { diabetes_type2: false, pcos: false, hypothyroidism: false },
      allergies_medications: data.allergies_medications || '',
      food_intolerances: data.food_intolerances || '',
      stress_level: data.stress_level ?? 5,
      food_control_level: data.food_control_level ?? 5,
      motivation_level: data.motivation_level ?? 5,
      notes: data.notes || '',
    })
    setLoading(false)
  }

  function update(key, val) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  function updateFamily(key, val) {
    setForm(prev => ({
      ...prev,
      family_history: { ...prev.family_history, [key]: val }
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.full_name.trim() || !form.assigned_doctor.trim()) {
      setError('Nombre del paciente y doctor asignado son obligatorios')
      return
    }

    setSaving(true)
    setError(null)

    const payload = {
      full_name: form.full_name.trim(),
      assigned_doctor: form.assigned_doctor.trim(),
      age: form.age ? parseInt(form.age) : null,
      height: form.height ? parseFloat(form.height) : null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      current_weight: form.current_weight ? parseFloat(form.current_weight) : null,
      initial_weight: form.initial_weight ? parseFloat(form.initial_weight) : null,
      best_weight_5_years: form.best_weight_5_years ? parseFloat(form.best_weight_5_years) : null,
      target_weight: form.target_weight ? parseFloat(form.target_weight) : null,
      has_diseases: form.has_diseases,
      diseases_description: form.has_diseases ? form.diseases_description.trim() : null,
      does_exercise: form.does_exercise,
      gynecological_problems: form.gynecological_problems,
      family_history: form.family_history,
      allergies_medications: form.allergies_medications.trim() || null,
      food_intolerances: form.food_intolerances.trim() || null,
      stress_level: form.stress_level,
      food_control_level: form.food_control_level,
      motivation_level: form.motivation_level,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }

    let result
    if (isEdit) {
      result = await supabase
        .from('nm_patients')
        .update(payload)
        .eq('id', id)
        .select()
        .single()
    } else {
      payload.professional_id = profile.id
      if (!payload.initial_weight && payload.current_weight) {
        payload.initial_weight = payload.current_weight
      }
      result = await supabase
        .from('nm_patients')
        .insert(payload)
        .select()
        .single()
    }

    if (result.error) {
      setError(result.error.message)
      setSaving(false)
      return
    }

    const patientId = result.data.id
    navigate(`/pro/patient/${patientId}`)
  }

  if (loading) {
    return (
      <ProLayout>
        <div className="flex justify-center py-20"><div className="loader" /></div>
      </ProLayout>
    )
  }

  return (
    <ProLayout>
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate(isEdit ? `/pro/patient/${id}` : '/pro')} className="btn btn-secondary !p-2 !rounded-xl">
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-[#F1F5F9]" style={{ fontFamily: 'var(--font-display)' }}>
                {isEdit ? 'Editar paciente' : 'Nuevo paciente'}
              </h1>
              <p className="text-xs text-[#4A5568] mt-0.5">
                {isEdit ? `Editando ficha de ${form.full_name || 'paciente'}` : 'Rellena los datos del nuevo paciente'}
              </p>
            </div>
          </div>
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? <Loader size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-xl bg-[rgba(248,113,113,0.06)] border border-red-100 text-[#FCA5A5] text-sm flex items-center gap-2">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        <div className="space-y-6">
          {/* ── DATOS PERSONALES ── */}
          <div className="card">
            <SectionHeader icon={User} title="Datos personales" subtitle="Información básica del paciente" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField label="Nombre completo" icon={User} value={form.full_name}
                onChange={v => update('full_name', v)} placeholder="María García López" required className="sm:col-span-2" />
              <InputField label="Doctor asignado" icon={FileText} value={form.assigned_doctor}
                onChange={v => update('assigned_doctor', v)} placeholder="Dr. Sergio Martínez" required />
              <InputField label="Edad" icon={Calendar} type="number" value={form.age}
                onChange={v => update('age', v)} placeholder="35" suffix="años" />
              <InputField label="Teléfono" icon={Phone} value={form.phone}
                onChange={v => update('phone', v)} placeholder="+34 600 123 456" />
              <InputField label="Email" icon={Mail} type="email" value={form.email}
                onChange={v => update('email', v)} placeholder="paciente@email.com" />
            </div>
          </div>

          {/* ── DATOS ANTROPOMÉTRICOS ── */}
          <div className="card">
            <SectionHeader icon={Scale} title="Datos antropométricos" subtitle="Peso y medidas corporales" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField label="Altura" icon={Ruler} type="number" value={form.height}
                onChange={v => update('height', v)} placeholder="165" suffix="cm" />
              <InputField label="Peso actual" icon={Scale} type="number" value={form.current_weight}
                onChange={v => update('current_weight', v)} placeholder="78.5" suffix="kg" />
              <InputField label="Peso inicial" icon={Scale} type="number" value={form.initial_weight}
                onChange={v => update('initial_weight', v)} placeholder="82.0" suffix="kg" />
              <InputField label="Mejor peso en 5 años" icon={Scale} type="number" value={form.best_weight_5_years}
                onChange={v => update('best_weight_5_years', v)} placeholder="68.0" suffix="kg" />
              <InputField label="Peso objetivo" icon={Scale} type="number" value={form.target_weight}
                onChange={v => update('target_weight', v)} placeholder="65.0" suffix="kg" />
            </div>

            {form.current_weight && form.height && (
              <div className="mt-4 p-3 rounded-xl bg-[rgba(45,212,191,0.08)]/50 border border-teal-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[#64748B]">IMC calculado</span>
                  <span className="text-sm font-bold text-[var(--color-brand)]">
                    {(parseFloat(form.current_weight) / Math.pow(parseFloat(form.height) / 100, 2)).toFixed(1)} kg/m²
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ── HISTORIAL MÉDICO ── */}
          <div className="card">
            <SectionHeader icon={Heart} title="Historial médico" subtitle="Antecedentes y condiciones de salud" />
            <div className="space-y-4">
              <Toggle label="¿Padece enfermedades?" checked={form.has_diseases}
                onChange={v => update('has_diseases', v)}
                description="Diabetes, hipertensión, tiroides, etc." />
              {form.has_diseases && (
                <div>
                  <label className="block text-xs font-medium text-[#64748B] mb-1.5">Descripción de enfermedades</label>
                  <textarea value={form.diseases_description}
                    onChange={e => update('diseases_description', e.target.value)}
                    placeholder="Describe las enfermedades o condiciones..."
                    className="input w-full min-h-[80px] resize-y" rows={3} />
                </div>
              )}
              <Toggle label="¿Realiza ejercicio físico?" checked={form.does_exercise}
                onChange={v => update('does_exercise', v)}
                description="Actividad física regular (3+ veces/semana)" />
              <Toggle label="¿Problemas ginecológicos?" checked={form.gynecological_problems}
                onChange={v => update('gynecological_problems', v)}
                description="SOP, endometriosis, menopausia, etc." />

              <div className="pt-3 border-t border-[rgba(255,255,255,0.04)]">
                <p className="text-xs font-medium text-[#64748B] mb-3">Antecedentes familiares</p>
                <div className="space-y-3">
                  <Toggle label="Diabetes Tipo 2" checked={form.family_history.diabetes_type2}
                    onChange={v => updateFamily('diabetes_type2', v)} />
                  <Toggle label="SOP (Síndrome de Ovario Poliquístico)" checked={form.family_history.pcos}
                    onChange={v => updateFamily('pcos', v)} />
                  <Toggle label="Hipotiroidismo" checked={form.family_history.hypothyroidism}
                    onChange={v => updateFamily('hypothyroidism', v)} />
                </div>
              </div>
            </div>
          </div>

          {/* ── ALERGIAS E INTOLERANCIAS ── */}
          <div className="card">
            <SectionHeader icon={Pill} title="Alergias e intolerancias" subtitle="Restricciones alimentarias y medicamentosas" />
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">Alergias a medicamentos</label>
                <textarea value={form.allergies_medications}
                  onChange={e => update('allergies_medications', e.target.value)}
                  placeholder="Penicilina, ibuprofeno, etc."
                  className="input w-full min-h-[70px] resize-y" rows={2} />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">Intolerancias alimentarias</label>
                <textarea value={form.food_intolerances}
                  onChange={e => update('food_intolerances', e.target.value)}
                  placeholder="Lactosa, gluten, fructosa, etc."
                  className="input w-full min-h-[70px] resize-y" rows={2} />
              </div>
            </div>
          </div>

          {/* ── NIVELES PSICOLÓGICOS ── */}
          <div className="card">
            <SectionHeader icon={Brain} title="Valoración psicológica" subtitle="Niveles subjetivos del paciente (0-10)" />
            <div className="space-y-6">
              <SliderField label="Nivel de estrés" icon={Activity}
                value={form.stress_level} onChange={v => update('stress_level', v)}
                color={form.stress_level > 6 ? 'red' : form.stress_level > 3 ? 'amber' : 'emerald'}
                description="0 = sin estrés, 10 = máximo estrés" />
              <SliderField label="Control sobre la alimentación" icon={Brain}
                value={form.food_control_level} onChange={v => update('food_control_level', v)}
                color={form.food_control_level < 4 ? 'red' : form.food_control_level < 7 ? 'amber' : 'emerald'}
                description="0 = sin control, 10 = control total" />
              <SliderField label="Motivación" icon={Heart}
                value={form.motivation_level} onChange={v => update('motivation_level', v)}
                color={form.motivation_level < 4 ? 'red' : form.motivation_level < 7 ? 'amber' : 'emerald'}
                description="0 = sin motivación, 10 = máxima motivación" />
            </div>
          </div>

          {/* ── NOTAS ── */}
          <div className="card">
            <SectionHeader icon={FileText} title="Notas" subtitle="Observaciones adicionales del profesional" />
            <textarea value={form.notes}
              onChange={e => update('notes', e.target.value)}
              placeholder="Observaciones relevantes para el seguimiento del paciente..."
              className="input w-full min-h-[100px] resize-y" rows={4} />
          </div>

          {/* ── BOTONES ── */}
          <div className="flex items-center justify-between pt-2 pb-8">
            <button type="button" onClick={() => navigate(isEdit ? `/pro/patient/${id}` : '/pro')}
              className="btn btn-secondary">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? <Loader size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear paciente'}
            </button>
          </div>
        </div>
      </form>
    </ProLayout>
  )
}
