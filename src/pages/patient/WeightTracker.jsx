import { useState, useEffect } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatDateShort } from '../../lib/dietConfig'
import PatientLayout from '../../components/layout/PatientLayout'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { Plus, TrendingDown, Target, Scale } from 'lucide-react'

export default function WeightTracker() {
  const { profile } = useAuth()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newWeight, setNewWeight] = useState('')
  const [newNote, setNewNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (profile?.id) load() }, [profile?.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('nm_weight_records')
      .select('*')
      .eq('patient_id', profile.id)
      .order('date', { ascending: true })
    setRecords(data || [])
    setLoading(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!newWeight) return
    setSaving(true)
    const today = new Date().toISOString().split('T')[0]
    // Upsert: if record exists for today, update it
    const existing = records.find(r => r.date === today)
    if (existing) {
      await supabase.from('nm_weight_records').update({ weight: parseFloat(newWeight), notes: newNote || null }).eq('id', existing.id)
    } else {
      await supabase.from('nm_weight_records').insert({ patient_id: profile.id, weight: parseFloat(newWeight), date: today, notes: newNote || null, recorded_by: 'patient' })
    }
    // Also update current_weight on patient
    await supabase.from('nm_patients').update({ current_weight: parseFloat(newWeight), updated_at: new Date().toISOString() }).eq('id', profile.id)
    setNewWeight('')
    setNewNote('')
    setShowForm(false)
    setSaving(false)
    load()
  }

  const chartData = records.map(r => ({
    date: formatDateShort(r.date),
    peso: Number(r.weight),
    fullDate: r.date,
  }))

  const target = profile?.target_weight ? Number(profile.target_weight) : null
  const initial = profile?.initial_weight ? Number(profile.initial_weight) : null
  const latest = records.length > 0 ? Number(records[records.length - 1].weight) : null
  const totalLost = initial && latest ? (initial - latest).toFixed(1) : null
  const remaining = target && latest ? (latest - target).toFixed(1) : null

  return (
    <PatientLayout
      title="Evolución de peso"
      rightAction={<button onClick={() => setShowForm(!showForm)} className="btn btn-primary btn-sm"><Plus size={14} /> Registrar</button>}
    >
      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="card !p-3 text-center">
          <Scale size={14} className="mx-auto text-teal-500 mb-1" />
          <p className="text-lg font-bold text-gray-900">{latest?.toFixed(1) || '—'}</p>
          <p className="text-[10px] text-gray-400">Actual (kg)</p>
        </div>
        <div className="card !p-3 text-center">
          <TrendingDown size={14} className="mx-auto text-emerald-500 mb-1" />
          <p className="text-lg font-bold text-emerald-600">{totalLost && Number(totalLost) > 0 ? `-${totalLost}` : totalLost || '—'}</p>
          <p className="text-[10px] text-gray-400">Perdidos (kg)</p>
        </div>
        <div className="card !p-3 text-center">
          <Target size={14} className="mx-auto text-blue-500 mb-1" />
          <p className="text-lg font-bold text-blue-600">{remaining && Number(remaining) > 0 ? remaining : remaining === '0.0' ? '🎉' : '—'}</p>
          <p className="text-[10px] text-gray-400">Para objetivo</p>
        </div>
      </div>

      {/* Entry form */}
      {showForm && (
        <form onSubmit={handleSave} className="card card--elevated mb-4 space-y-3">
          <p className="text-sm font-semibold text-gray-800">Nuevo registro</p>
          <div className="flex gap-2">
            <input type="number" step="0.1" min="30" max="300" className="input flex-1" placeholder="Peso (kg)" value={newWeight} onChange={e => setNewWeight(e.target.value)} autoFocus required />
            <input type="text" className="input flex-1" placeholder="Nota (opcional)" value={newNote} onChange={e => setNewNote(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary btn-sm flex-1">Cancelar</button>
            <button type="submit" disabled={saving || !newWeight} className="btn btn-primary btn-sm flex-1">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      )}

      {/* Chart */}
      {loading ? (
        <div className="flex justify-center py-16"><div className="loader" /></div>
      ) : chartData.length > 1 ? (
        <div className="card card--elevated mb-4">
          <p className="text-xs font-semibold text-gray-500 mb-3">Evolución</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94A3B8' }} />
              <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} domain={['dataMin - 2', 'dataMax + 2']} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 13 }}
                formatter={(val) => [`${val} kg`, 'Peso']}
              />
              <Line type="monotone" dataKey="peso" stroke="#0D9488" strokeWidth={2.5} dot={{ fill: '#0D9488', r: 3 }} activeDot={{ r: 5 }} />
              {target && <ReferenceLine y={target} stroke="#3B82F6" strokeDasharray="5 5" label={{ value: `Objetivo: ${target}`, position: 'right', fontSize: 10, fill: '#3B82F6' }} />}
              {initial && <ReferenceLine y={initial} stroke="#EF4444" strokeDasharray="3 3" label={{ value: `Inicio: ${initial}`, position: 'left', fontSize: 10, fill: '#EF4444' }} />}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="card text-center py-10">
          <Scale size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">Registra tu primer peso para ver la gráfica</p>
        </div>
      )}

      {/* History */}
      {records.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-800 mb-2">Historial</p>
          <div className="space-y-1.5">
            {[...records].reverse().slice(0, 20).map(r => (
              <div key={r.id} className="card !p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{Number(r.weight).toFixed(1)} kg</p>
                  <p className="text-[11px] text-gray-400">{formatDateShort(r.date)}{r.notes ? ` · ${r.notes}` : ''}</p>
                </div>
                <span className="text-[10px] text-gray-300 font-mono">{r.recorded_by === 'patient' ? 'Tú' : 'Dr.'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </PatientLayout>
  )
}
