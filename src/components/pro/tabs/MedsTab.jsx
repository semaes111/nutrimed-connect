/**
 * src/components/pro/tabs/MedsTab.jsx
 *
 * Responsabilidad: gestión de la medicación del paciente (CRUD).
 * Incluye manejo de errores explícito en todas las operaciones async.
 */

import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase.js'
import { MedRow } from '../helpers/index.jsx'
import { Pill, Plus } from 'lucide-react'

const EMPTY_FORM = {
  medication_name: '', dosage: '', frequency: '', clicks: '',
  start_date: '', end_date: '', side_effects: '', side_effects_treatment: '',
}

/**
 * @param {{ patient: object, onUpdate: Function }} props
 */
export default function MedsTab({ patient, onUpdate }) {
  const [meds,    setMeds]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form,    setForm]    = useState(EMPTY_FORM)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => { loadMeds() }, [])

  async function loadMeds() {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('nm_medications').select('*')
        .eq('patient_id', patient.id)
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      setMeds(data || [])
    } catch (err) {
      console.error('[MedsTab] loadMeds error:', err)
      setError('Error al cargar la medicación.')
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const { error } = await supabase.from('nm_medications').insert({
        patient_id: patient.id,
        medication_name: form.medication_name,
        dosage:                   form.dosage || null,
        frequency:                form.frequency || null,
        clicks:                   form.clicks ? parseInt(form.clicks) : null,
        start_date:               form.start_date || null,
        end_date:                 form.end_date || null,
        side_effects:             form.side_effects || null,
        side_effects_treatment:   form.side_effects_treatment || null,
        is_active: true,
      })
      if (error) throw error
      setForm(EMPTY_FORM)
      setShowAdd(false)
      await loadMeds()
    } catch (err) {
      console.error('[MedsTab] handleAdd error:', err)
      setError('Error al guardar la medicación.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(med) {
    setError(null)
    try {
      const { error } = await supabase
        .from('nm_medications').update({ is_active: !med.is_active }).eq('id', med.id)
      if (error) throw error
      await loadMeds()
    } catch (err) {
      console.error('[MedsTab] toggleActive error:', err)
      setError('Error al actualizar el estado de la medicación.')
    }
  }

  async function deleteMed(med) {
    if (!confirm(`¿Eliminar ${med.medication_name}?`)) return
    setError(null)
    try {
      const { error } = await supabase.from('nm_medications').delete().eq('id', med.id)
      if (error) throw error
      await loadMeds()
    } catch (err) {
      console.error('[MedsTab] deleteMed error:', err)
      setError('Error al eliminar la medicación.')
    }
  }

  const activeMeds   = meds.filter(m => m.is_active)
  const inactiveMeds = meds.filter(m => !m.is_active)

  return (
    <div>
      {error && (
        <div className="mb-3 px-4 py-2.5 rounded-xl text-xs font-medium"
          style={{ background: 'rgba(248,113,113,0.08)', color: '#FB7185', border: '1px solid rgba(248,113,113,0.2)' }}>
          {error}
        </div>
      )}

      <div className="flex justify-between mb-4">
        <p className="text-sm text-[#64748B]">Medicación activa: {activeMeds.length}</p>
        <button onClick={() => setShowAdd(!showAdd)} className="btn btn-primary btn-sm">
          <Plus size={14} /> Añadir
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="card card--elevated mb-4 space-y-3">
          <p className="text-sm font-semibold text-[#E2E8F0]">Nueva medicación</p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { key: 'medication_name', label: 'Nombre *', type: 'text', required: true, placeholder: '' },
              { key: 'dosage',          label: 'Dosis',    type: 'text', placeholder: 'Ej: 500mg' },
              { key: 'frequency',       label: 'Frecuencia', type: 'text', placeholder: 'Ej: 1/día' },
            ].map(({ key, label, type, required, placeholder }) => (
              <div key={key}>
                <label className="text-xs text-[#64748B]">{label}</label>
                <input
                  type={type} className="input w-full" required={required}
                  placeholder={placeholder}
                  value={form[key]}
                  onChange={e => setForm({ ...form, [key]: e.target.value })}
                />
              </div>
            ))}
            <div>
              <label className="text-xs text-[#64748B]">Clicks</label>
              <input type="number" className="input w-full" value={form.clicks}
                onChange={e => setForm({ ...form, clicks: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-[#64748B]">Inicio</label>
              <input type="date" className="input w-full" value={form.start_date}
                onChange={e => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-[#64748B]">Fin</label>
              <input type="date" className="input w-full" value={form.end_date}
                onChange={e => setForm({ ...form, end_date: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#64748B]">Efectos secundarios</label>
              <input className="input w-full" value={form.side_effects}
                onChange={e => setForm({ ...form, side_effects: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-[#64748B]">Solución efectos secundarios</label>
              <input className="input w-full" value={form.side_effects_treatment}
                onChange={e => setForm({ ...form, side_effects_treatment: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowAdd(false)} className="btn btn-secondary btn-sm">Cancelar</button>
            <button type="submit" disabled={saving || !form.medication_name} className="btn btn-primary btn-sm">
              {saving ? '...' : 'Guardar'}
            </button>
          </div>
        </form>
      )}

      {loading
        ? <div className="flex justify-center py-10"><div className="loader" /></div>
        : meds.length === 0
          ? (
            <div className="card text-center py-10">
              <Pill size={32} className="mx-auto text-[#2A2F38] mb-2" />
              <p className="text-sm text-[#4A5568]">Sin medicación</p>
            </div>
          ) : (
            <>
              {activeMeds.length > 0 && (
                <div className="space-y-2 mb-4">
                  {activeMeds.map(med => (
                    <MedRow key={med.id} med={med} onToggle={toggleActive} onDelete={deleteMed} />
                  ))}
                </div>
              )}
              {inactiveMeds.length > 0 && (
                <div>
                  <p className="text-xs text-[#4A5568] mb-2">Inactivas</p>
                  <div className="space-y-2 opacity-60">
                    {inactiveMeds.map(med => (
                      <MedRow key={med.id} med={med} onToggle={toggleActive} onDelete={deleteMed} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )
      }
    </div>
  )
}
