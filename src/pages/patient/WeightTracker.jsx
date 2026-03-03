import { useState, useEffect } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatDateShort } from '../../lib/dietConfig'
import PatientLayout from '../../components/layout/PatientLayout'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { Plus, TrendingDown, Target, Scale } from 'lucide-react'

const NEU_CARD = {
  background: 'linear-gradient(145deg, #262B34, #1F232B)',
  border: '1px solid rgba(255,255,255,0.04)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.35), -4px -4px 12px rgba(255,255,255,0.025), inset 1px 1px 0 rgba(255,255,255,0.06)',
  borderRadius: 20,
}
const NEU_STAT = { ...NEU_CARD, padding: 14, borderRadius: 18 }
const NEU_INSET = {
  background: 'linear-gradient(145deg, #1A1D23, #1E2128)',
  boxShadow: 'inset 3px 3px 6px rgba(0,0,0,0.3), inset -2px -2px 4px rgba(255,255,255,0.025)',
  border: '1px solid rgba(255,255,255,0.03)',
  borderRadius: 16,
}

const TOOLTIP_STYLE = { background: '#2A2F38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, boxShadow: '8px 8px 24px rgba(0,0,0,0.4)', color: '#E2E8F0', fontSize: 13 }

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
    const { data } = await supabase.from('nm_weight_records').select('*').eq('patient_id', profile.id).order('date', { ascending: true })
    setRecords(data || [])
    setLoading(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!newWeight) return
    setSaving(true)
    const today = new Date().toISOString().split('T')[0]
    const existing = records.find(r => r.date === today)
    if (existing) {
      await supabase.from('nm_weight_records').update({ weight: parseFloat(newWeight), notes: newNote || null }).eq('id', existing.id)
    } else {
      await supabase.from('nm_weight_records').insert({ patient_id: profile.id, weight: parseFloat(newWeight), date: today, notes: newNote || null, recorded_by: 'patient' })
    }
    await supabase.from('nm_patients').update({ current_weight: parseFloat(newWeight), updated_at: new Date().toISOString() }).eq('id', profile.id)
    setNewWeight(''); setNewNote(''); setShowForm(false); setSaving(false); load()
  }

  const chartData = records.map(r => ({ date: formatDateShort(r.date), peso: Number(r.weight), fullDate: r.date }))
  const target = profile?.target_weight ? Number(profile.target_weight) : null
  const initial = profile?.initial_weight ? Number(profile.initial_weight) : null
  const latest = records.length > 0 ? Number(records[records.length - 1].weight) : null
  const totalLost = initial && latest ? (initial - latest).toFixed(1) : null
  const remaining = target && latest ? (latest - target).toFixed(1) : null

  const allValues = chartData.map(d => d.peso)
  if (target) allValues.push(target)
  if (initial) allValues.push(initial)
  const yMin = allValues.length > 0 ? Math.floor(Math.min(...allValues) - 2) : 'auto'
  const yMax = allValues.length > 0 ? Math.ceil(Math.max(...allValues) + 2) : 'auto'

  return (
    <PatientLayout
      title="Evolución de peso"
      rightAction={<button onClick={() => setShowForm(!showForm)} className="btn btn-primary btn-sm"><Plus size={14} /> Registrar</button>}
    >
      {/* Stats */}
      <div className="grid grid-cols-3 gap-2.5 mb-4">
        <div className="text-center" style={NEU_STAT}>
          <Scale size={14} className="mx-auto mb-1" style={{ color: '#2DD4BF' }} />
          <p className="text-lg font-bold" style={{ color: '#F1F5F9' }}>{latest?.toFixed(1) || '—'}</p>
          <p className="text-[10px]" style={{ color: '#4A5568' }}>Actual (kg)</p>
        </div>
        <div className="text-center" style={NEU_STAT}>
          <TrendingDown size={14} className="mx-auto mb-1" style={{ color: '#34D399' }} />
          <p className="text-lg font-bold" style={{ color: '#34D399' }}>{totalLost && Number(totalLost) > 0 ? `-${totalLost}` : totalLost || '—'}</p>
          <p className="text-[10px]" style={{ color: '#4A5568' }}>Perdidos (kg)</p>
        </div>
        <div className="text-center" style={NEU_STAT}>
          <Target size={14} className="mx-auto mb-1" style={{ color: '#60A5FA' }} />
          <p className="text-lg font-bold" style={{ color: '#60A5FA' }}>{remaining && Number(remaining) > 0 ? remaining : remaining === '0.0' ? '🎉' : '—'}</p>
          <p className="text-[10px]" style={{ color: '#4A5568' }}>Para objetivo</p>
        </div>
      </div>

      {/* Entry form */}
      {showForm && (
        <form onSubmit={handleSave} className="mb-4 space-y-3 p-4 rounded-[20px]"
          style={{ ...NEU_CARD, background: 'linear-gradient(145deg, #2C3140, #232830)', borderColor: 'rgba(45,212,191,0.08)', boxShadow: NEU_CARD.boxShadow + ', 0 0 24px rgba(45,212,191,0.04)' }}>
          <p className="text-sm font-semibold" style={{ color: '#E2E8F0' }}>Nuevo registro</p>
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
        <div className="mb-4 p-4 rounded-[20px]" style={NEU_CARD}>
          <p className="text-xs font-semibold mb-3" style={{ color: '#64748B' }}>Evolución</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#4A5568' }} stroke="rgba(255,255,255,0.06)" />
              <YAxis tick={{ fontSize: 10, fill: '#4A5568' }} domain={[yMin, yMax]} stroke="rgba(255,255,255,0.06)" />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(val) => [`${val} kg`, 'Peso']} />
              <Line type="monotone" dataKey="peso" stroke="#2DD4BF" strokeWidth={2.5} dot={{ fill: '#2DD4BF', r: 3, stroke: '#1A1D23', strokeWidth: 2 }} activeDot={{ r: 5, fill: '#5EEAD4', stroke: '#2DD4BF', strokeWidth: 2 }} />
              {target && <ReferenceLine y={target} stroke="#60A5FA" strokeDasharray="5 5" label={{ value: `Obj: ${target}`, position: 'right', fontSize: 10, fill: '#60A5FA' }} />}
              {initial && <ReferenceLine y={initial} stroke="#FB7185" strokeDasharray="3 3" label={{ value: `Ini: ${initial}`, position: 'left', fontSize: 10, fill: '#FB7185' }} />}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="text-center py-10 rounded-[20px]" style={NEU_CARD}>
          <Scale size={32} className="mx-auto mb-3" style={{ color: '#333A45' }} />
          <p className="text-sm" style={{ color: '#4A5568' }}>Registra tu primer peso para ver la gráfica</p>
        </div>
      )}

      {/* History */}
      {records.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-2" style={{ color: '#E2E8F0' }}>Historial</p>
          <div className="space-y-1.5">
            {[...records].reverse().slice(0, 20).map(r => (
              <div key={r.id} className="flex items-center justify-between p-3 rounded-[16px]" style={NEU_CARD}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#E2E8F0' }}>{Number(r.weight).toFixed(1)} kg</p>
                  <p className="text-[11px]" style={{ color: '#4A5568' }}>{formatDateShort(r.date)}{r.notes ? ` · ${r.notes}` : ''}</p>
                </div>
                <span className="text-[10px] font-mono" style={{ color: '#333A45' }}>{r.recorded_by === 'patient' ? 'Tú' : 'Dr.'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </PatientLayout>
  )
}
