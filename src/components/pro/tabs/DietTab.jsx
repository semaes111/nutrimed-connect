/**
 * src/components/pro/tabs/DietTab.jsx
 *
 * Responsabilidad: gestión de la dieta semanal del paciente (base + overrides por día).
 * Incluye manejo de errores explícito en todas las operaciones async.
 */

import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase.js'
import { getDietConfig, DAYS_ORDER, DAY_LABELS } from '../../../lib/diet/constants.js'
import { Calendar, AlertTriangle, Trash2, ChevronDown } from 'lucide-react'

/**
 * @param {{ patient: object, professionalId: string, onUpdate: Function }} props
 */
export default function DietTab({ patient, professionalId, onUpdate }) {
  const [weeklyDiet, setWeeklyDiet] = useState([])
  const [basePlan,   setBasePlan]   = useState(null)
  const [dietas,     setDietas]     = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [saving,     setSaving]     = useState(null) // null | 'base' | day string
  const [editingDay, setEditingDay] = useState(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      await Promise.all([loadWeekly(), loadBase(), loadDietas()])
    } catch (err) {
      console.error('[DietTab] loadAll error:', err)
      setError('Error al cargar las dietas. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  async function loadWeekly() {
    const { data, error } = await supabase.rpc('get_patient_weekly_diet', { p_patient_id: patient.id })
    if (error) throw error
    setWeeklyDiet(data || [])
  }

  async function loadBase() {
    const { data, error } = await supabase
      .from('nm_diet_plans')
      .select('*, dieta_ref:dietas_validas(nombre, slug, nivel_restriccion)')
      .eq('patient_id', patient.id)
      .eq('day_of_week', 'todos')
      .eq('is_active', true)
      .maybeSingle()
    if (error) throw error
    setBasePlan(data || null)
  }

  async function loadDietas() {
    const { data, error } = await supabase
      .from('dietas_validas').select('*').eq('activa', true)
      .order('nivel_restriccion', { ascending: false })
    if (error) throw error
    setDietas(data || [])
  }

  async function handleAssignBase(dietSlug) {
    if (!dietSlug) return
    setSaving('base')
    setError(null)
    try {
      const dieta = dietas.find(d => d.slug === dietSlug)
      if (!dieta) return
      const { error } = await supabase.rpc('assign_base_diet', {
        p_patient_id: patient.id,
        p_professional_id: professionalId,
        p_dieta_valida_id: dieta.id,
        p_diet_type: dieta.slug,
        p_diet_name: dieta.nombre,
      })
      if (error) throw error
      await Promise.all([loadWeekly(), loadBase()])
      // Notificar al padre (ProPatientDetail) para que recargue nm_patients.
      // Necesario si el componente padre deriva datos del campo diet_type del paciente.
      onUpdate()
    } catch (err) {
      console.error('[DietTab] handleAssignBase error:', err)
      setError('Error al asignar dieta base.')
    } finally {
      setSaving(null)
    }
  }

  async function handleOverrideDay(day, dietSlug) {
    if (!dietSlug) return
    setSaving(day)
    setError(null)
    try {
      const dieta = dietas.find(d => d.slug === dietSlug)
      if (!dieta) return
      const { error } = await supabase.rpc('override_day_diet', {
        p_patient_id: patient.id,
        p_professional_id: professionalId,
        p_dieta_valida_id: dieta.id,
        p_diet_type: dieta.slug,
        p_day_of_week: day,
        p_diet_name: dieta.nombre,
      })
      if (error) throw error
      await loadWeekly()
      setEditingDay(null)
    } catch (err) {
      console.error('[DietTab] handleOverrideDay error:', err)
      setError(`Error al personalizar ${DAY_LABELS[day]}.`)
    } finally {
      setSaving(null)
    }
  }

  async function handleRemoveOverride(day) {
    setSaving(day)
    setError(null)
    try {
      const { error } = await supabase.rpc('remove_day_override', {
        p_patient_id: patient.id,
        p_day_of_week: day,
      })
      if (error) throw error
      await loadWeekly()
    } catch (err) {
      console.error('[DietTab] handleRemoveOverride error:', err)
      setError(`Error al quitar personalización de ${DAY_LABELS[day]}.`)
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <div className="flex justify-center py-10"><div className="loader" /></div>

  const baseCfg      = basePlan ? getDietConfig(basePlan.diet_type) : null
  const overrideCount = weeklyDiet.filter(d => d.source === 'override').length

  return (
    <div className="space-y-6">
      {error && (
        <div className="px-4 py-2.5 rounded-xl text-xs font-medium"
          style={{ background: 'rgba(248,113,113,0.08)', color: '#FB7185', border: '1px solid rgba(248,113,113,0.2)' }}>
          {error}
        </div>
      )}

      {/* BASE DIET SELECTOR */}
      <div className="card card--elevated"
        style={baseCfg ? { borderLeft: `4px solid ${baseCfg.color}`, background: `linear-gradient(135deg, ${baseCfg.bg}44 0%, white 60%)` } : {}}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider flex items-center gap-2">
              <Calendar size={13} /> Dieta base · Todos los días
            </p>
            {baseCfg && (
              <p className="text-[11px] text-[#4A5568] mt-0.5">
                Se aplica a los {7 - overrideCount} días sin personalización
              </p>
            )}
          </div>
          {baseCfg && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ backgroundColor: baseCfg.bg, color: baseCfg.color }}>
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
          <p className="text-xs text-[#E9A820] mt-2 flex items-center gap-1.5">
            <AlertTriangle size={12} /> Selecciona una dieta base primero. Luego podrás personalizar días sueltos.
          </p>
        )}
      </div>

      {/* WEEKLY GRID */}
      {basePlan && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-[#E2E8F0] flex items-center gap-2">
              Plan semanal
              {overrideCount > 0 && (
                <span className="text-[11px] font-normal text-[#4A5568]">
                  ({overrideCount} {overrideCount === 1 ? 'día personalizado' : 'días personalizados'})
                </span>
              )}
            </p>
          </div>

          <div className="space-y-1.5">
            {DAYS_ORDER.map(day => {
              const dayData   = weeklyDiet.find(d => d.day_of_week === day)
              const isOverride = dayData?.source === 'override'
              const cfg        = dayData ? getDietConfig(dayData.diet_type) : baseCfg
              const isEditing  = editingDay === day
              const isSaving   = saving === day

              return (
                <div key={day}>
                  <div
                    className={`card !p-3 flex items-center gap-3 cursor-pointer transition-all hover:shadow-md ${isOverride ? 'ring-1 ring-offset-1' : ''}`}
                    style={isOverride && cfg ? { borderLeft: `3px solid ${cfg.color}`, ringColor: `${cfg.color}40` } : {}}
                    onClick={() => setEditingDay(isEditing ? null : day)}
                  >
                    <span className="text-sm font-semibold text-[#CBD5E1] w-20 shrink-0">{DAY_LABELS[day]}</span>

                    {cfg && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                        style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                        {cfg.icon} {cfg.label}
                      </span>
                    )}

                    <span className="flex-1" />

                    {isOverride
                      ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[rgba(96,165,250,0.06)] text-blue-500">Personalizado</span>
                      : <span className="text-[10px] text-[#333A45]">= base</span>
                    }

                    {isOverride && (
                      <button
                        onClick={e => { e.stopPropagation(); handleRemoveOverride(day) }}
                        className="text-[#333A45] hover:text-red-400 p-1 transition"
                        title="Quitar personalización (volver a base)"
                        disabled={isSaving}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}

                    <ChevronDown size={14} className={`text-[#333A45] transition-transform ${isEditing ? 'rotate-180' : ''}`} />
                  </div>

                  {/* Inline editor de día */}
                  {isEditing && (
                    <div className="ml-4 mt-1 mb-2 p-3 rounded-xl bg-[#1F232B] border border-[rgba(255,255,255,0.04)]">
                      <p className="text-[11px] text-[#4A5568] mb-2">Cambiar dieta del {DAY_LABELS[day].toLowerCase()}:</p>
                      <div className="flex gap-2 flex-wrap">
                        {dietas.map(d => {
                          const dCfg    = getDietConfig(d.slug)
                          const isActive = dayData?.diet_type === d.slug
                          const isBase   = basePlan?.diet_type === d.slug && !isOverride
                          return (
                            <button
                              key={d.slug}
                              onClick={() => {
                                if (isBase) return
                                if (d.slug === basePlan?.diet_type && isOverride) {
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
                                backgroundColor: isActive ? `${dCfg.color}18` : dCfg.bg,
                                color: dCfg.color,
                                borderColor: isActive ? dCfg.color : 'transparent',
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
