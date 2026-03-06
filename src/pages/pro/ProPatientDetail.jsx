/**
 * src/pages/pro/ProPatientDetail.jsx
 *
 * Responsabilidad única: shell del detalle de paciente.
 * - Carga datos del paciente (nm_patients)
 * - Renderiza cabecera y navegación de tabs
 * - Delega cada tab a su componente especializado
 *
 * Antes: 870 líneas con 7 sub-componentes inline.
 * Ahora: ~100 líneas — todos los tabs viven en src/components/pro/tabs/
 */

import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'
import { getDaysRemaining } from '../../lib/diet/utils.js'
import ProLayout from '../../components/layout/ProLayout'
import MealsTab from '../../components/pro/MealsTab'

// Tabs extraídos — un archivo por responsabilidad
import OverviewTab from '../../components/pro/tabs/OverviewTab.jsx'
import DietTab     from '../../components/pro/tabs/DietTab.jsx'
import WeightTab   from '../../components/pro/tabs/WeightTab.jsx'
import MedsTab     from '../../components/pro/tabs/MedsTab.jsx'
import AccessTab   from '../../components/pro/tabs/AccessTab.jsx'
import ShoppingListTab from '../../components/pro/tabs/ShoppingListTab.jsx'

import { ArrowLeft, Edit, Phone, Mail } from 'lucide-react'

const TABS = [
  { key: 'overview',  label: 'General'    },
  { key: 'diet',      label: 'Dietas'     },
  { key: 'meals',     label: 'Menús'      },
  { key: 'shopping',  label: '🛒 Compra'  },
  { key: 'weight',    label: 'Peso'       },
  { key: 'meds',      label: 'Medicación' },
  { key: 'access',    label: 'Acceso'     },
]

export default function ProPatientDetail() {
  const { id } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [patient, setPatient] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [tab,     setTab]     = useState('overview')

  useEffect(() => { if (id) loadPatient() }, [id])

  async function loadPatient() {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('nm_patients').select('*').eq('id', id).single()
      if (error) throw error
      setPatient(data)
    } catch (err) {
      console.error('[ProPatientDetail] loadPatient error:', err)
      setError('No se pudo cargar el paciente.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <ProLayout>
        <div className="flex justify-center py-20"><div className="loader" /></div>
      </ProLayout>
    )
  }

  if (error || !patient) {
    return (
      <ProLayout>
        <div className="card text-center py-20">
          <p className="text-[#4A5568] text-sm">{error || 'Paciente no encontrado'}</p>
          <button onClick={() => navigate('/pro')} className="btn btn-secondary btn-sm mt-4">
            <ArrowLeft size={14} /> Volver
          </button>
        </div>
      </ProLayout>
    )
  }

  const daysLeft = getDaysRemaining(patient.code_expiry)

  return (
    <ProLayout>
      {/* ── Cabecera del paciente ── */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/pro')} className="btn btn-secondary !p-2 !rounded-xl">
            <ArrowLeft size={18} />
          </button>
          <div className="w-14 h-14 rounded-2xl bg-[rgba(45,212,191,0.08)] flex items-center justify-center text-lg font-bold text-[var(--color-brand)]">
            {patient.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#F1F5F9]" style={{ fontFamily: 'var(--font-display)' }}>
              {patient.full_name}
            </h1>
            <div className="flex items-center gap-3 mt-1 text-xs text-[#4A5568]">
              {patient.phone && <span className="flex items-center gap-1"><Phone size={11} /> {patient.phone}</span>}
              {patient.email && <span className="flex items-center gap-1"><Mail size={11} /> {patient.email}</span>}
              {patient.age && <span>{patient.age} años</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {patient.is_blocked && (
            <span className="badge bg-[rgba(248,113,113,0.06)] text-[#FB7185]">Bloqueado</span>
          )}
          {daysLeft !== null && daysLeft <= 7 && daysLeft > 0 && (
            <span className="badge bg-[rgba(251,191,36,0.04)] text-[#E9A820]">{daysLeft} días</span>
          )}
          <Link to={`/pro/patient/${id}/edit`} className="btn btn-primary btn-sm">
            <Edit size={14} /> Editar
          </Link>
        </div>
      </div>

      {/* ── Navegación de tabs ── */}
      <div className="flex gap-1 mb-6 border-b border-[rgba(255,255,255,0.04)] pb-px">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition ${
              tab === t.key
                ? 'bg-[rgba(45,212,191,0.08)] text-[var(--color-brand)] border-b-2 border-[var(--color-brand)]'
                : 'text-[#4A5568] hover:text-[#94A3B8]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Contenido del tab activo ── */}
      <div className="page-enter">
        {tab === 'overview'  && <OverviewTab patient={patient} />}
        {tab === 'diet'      && <DietTab patient={patient} professionalId={profile?.id} onUpdate={loadPatient} />}
        {tab === 'meals'     && <MealsTab patient={patient} professionalId={profile?.id} />}
        {tab === 'shopping'  && <ShoppingListTab patient={patient} professionalId={profile?.id} />}
        {tab === 'weight'    && <WeightTab patient={patient} />}
        {tab === 'meds'      && <MedsTab patient={patient} onUpdate={loadPatient} />}
        {tab === 'access'    && <AccessTab patient={patient} onUpdate={loadPatient} />}
      </div>
    </ProLayout>
  )
}
