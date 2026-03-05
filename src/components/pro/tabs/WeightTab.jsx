/**
 * src/components/pro/tabs/WeightTab.jsx
 *
 * Responsabilidad: registro y visualización del historial de peso del paciente.
 * Incluye manejo de errores explícito en todas las operaciones async.
 */

import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase.js'
import { formatDate, formatDateShort } from '../../../lib/diet/utils.js'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { TrendingDown, Plus, Trash2 } from 'lucide-react'

/**
 * @param {{ patient: object }} props
 */
export default function WeightTab({ patient }) {
  const [records,   setRecords]  = useState([])
  const [loading,   setLoading]  = useState(true)
  const [error,     setError]    = useState(null)
  const [showAdd,   setShowAdd]  = useState(false)
  const [newWeight, setNewWeight] = useState('')
  const [newDate,   setNewDate]  = useState(new Date().toISOString().split('T')[0])
  const [newNote,   setNewNote]  = useState('')
  const [saving,    setSaving]   = useState(false)

  useEffect(() => { loadRecords() }, [])

  async function loadRecords() {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('nm_weight_records').select('*')
        .eq('patient_id', patient.id)
        .order('date', { ascending: true })
      if (error) throw error
      setRecords(data || [])
    } catch (err) {
      console.error('[WeightTab] loadRecords error:', err)
      setError('Error al cargar el historial de peso.')
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!newWeight || !newDate) return
    setSaving(true)
    setError(null)
    try {
      const { error: insErr } = await supabase.from('nm_weight_records').insert({
        patient_id: patient.id,
        weight: parseFloat(newWeight),
        date: newDate,
        notes: newNote || null,
        recorded_by: 'professional',
      })
      if (insErr) throw insErr

      const { error: updErr } = await supabase
        .from('nm_patients').update({ current_weight: parseFloat(newWeight) }).eq('id', patient.id)
      if (updErr) throw updErr

      setNewWeight('')
      setNewNote('')
      setShowAdd(false)
      await loadRecords()
    } catch (err) {
      console.error('[WeightTab] handleAdd error:', err)
      setError('Error al guardar el registro de peso.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(recordId) {
    if (!confirm('¿Eliminar este registro?')) return
    setError(null)
    try {
      const { error } = await supabase.from('nm_weight_records').delete().eq('id', recordId)
      if (error) throw error
      await loadRecords()
    } catch (err) {
      console.error('[WeightTab] handleDelete error:', err)
      setError('Error al eliminar el registro.')
    }
  }

  const chartData = records.map(r => ({ date: formatDateShort(r.date), peso: Number(r.weight) }))
  const target    = patient.target_weight  ? Number(patient.target_weight)  : null
  const initial   = patient.initial_weight ? Number(patient.initial_weight) : null
  const latest    = records.length > 0 ? Number(records[records.length - 1].weight) : null
  const totalChange = initial && latest ? (initial - latest).toFixed(1) : null

  const allValues = chartData.map(d => d.peso)
  if (target)  allValues.push(target)
  if (initial) allValues.push(initial)
  const yMin = allValues.length > 0 ? Math.floor(Math.min(...allValues) - 2) : 'auto'
  const yMax = allValues.length > 0 ? Math.ceil(Math.max(...allValues) + 2)  : 'auto'

  return (
    <div>
      {error && (
        <div className="mb-3 px-4 py-2.5 rounded-xl text-xs font-medium"
          style={{ background: 'rgba(248,113,113,0.08)', color: '#FB7185', border: '1px solid rgba(248,113,113,0.2)' }}>
          {error}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-4">
          {latest && (
            <span className="text-sm text-[#64748B]">
              Actual: <strong className="text-[#E2E8F0]">{latest.toFixed(1)} kg</strong>
            </span>
          )}
          {totalChange && Number(totalChange) > 0 && (
            <span className="text-sm text-[#34D399] flex items-center gap-1">
              <TrendingDown size={14} /> -{totalChange} kg
            </span>
          )}
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="btn btn-primary btn-sm">
          <Plus size={14} /> Registrar
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="card card--elevated mb-4 flex items-end gap-3">
          <div className="flex-1">
            <label className="text-xs text-[#64748B]">Peso (kg)</label>
            <input type="number" step="0.1" min="30" max="300" className="input w-full"
              value={newWeight} onChange={e => setNewWeight(e.target.value)} required />
          </div>
          <div className="flex-1">
            <label className="text-xs text-[#64748B]">Fecha</label>
            <input type="date" className="input w-full"
              value={newDate} onChange={e => setNewDate(e.target.value)} required />
          </div>
          <div className="flex-1">
            <label className="text-xs text-[#64748B]">Nota</label>
            <input type="text" className="input w-full"
              value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Opcional" />
          </div>
          <button type="submit" disabled={saving} className="btn btn-primary btn-sm">
            {saving ? '...' : 'Guardar'}
          </button>
        </form>
      )}

      {loading
        ? <div className="flex justify-center py-10"><div className="loader" /></div>
        : chartData.length > 1
          ? (
            <div className="card card--elevated mb-4">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94A3B8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} domain={[yMin, yMax]} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,.1)', fontSize: 13 }}
                    formatter={v => [`${v} kg`, 'Peso']}
                  />
                  <Line type="monotone" dataKey="peso" stroke="#0D9488" strokeWidth={2.5}
                    dot={{ fill: '#0D9488', r: 3 }} activeDot={{ r: 5 }} />
                  {target && (
                    <ReferenceLine y={target} stroke="#3B82F6" strokeDasharray="5 5"
                      label={{ value: `Obj: ${target}`, position: 'right', fontSize: 10, fill: '#3B82F6' }} />
                  )}
                  {initial && (
                    <ReferenceLine y={initial} stroke="#EF4444" strokeDasharray="3 3"
                      label={{ value: `Ini: ${initial}`, position: 'left', fontSize: 10, fill: '#EF4444' }} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="card text-center py-10">
              <p className="text-sm text-[#4A5568]">Registra pesos para ver la gráfica</p>
            </div>
          )
      }

      {records.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-[#CBD5E1] mb-2">Historial ({records.length})</p>
          <div className="space-y-1">
            {[...records].reverse().map(r => (
              <div key={r.id} className="card !p-2.5 flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold text-[#E2E8F0]">{Number(r.weight).toFixed(1)} kg</span>
                  <span className="text-xs text-[#4A5568] ml-2">{formatDate(r.date)}</span>
                  {r.notes && <span className="text-xs text-[#333A45] ml-2">{r.notes}</span>}
                  <span className="text-[10px] text-[#333A45] ml-2">
                    {r.recorded_by === 'patient' ? 'Paciente' : 'Doctor'}
                  </span>
                </div>
                <button onClick={() => handleDelete(r.id)} className="text-[#333A45] hover:text-red-400 transition p-1">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
