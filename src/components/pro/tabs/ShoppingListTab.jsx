/**
 * src/components/pro/tabs/ShoppingListTab.jsx
 *
 * Responsabilidad: previsualización de la lista de la compra del paciente
 * para el profesional. Solo lectura + botón de regeneración manual.
 *
 * Props: { patient, professionalId }
 * Datos: nm_shopping_lists (is_current=true, patient_id=patient.id)
 */

import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase.js'
import { SHOPPING_CATEGORIES as CATEGORIES } from '../../../lib/dietConfig'
import { ShoppingCart, RefreshCw, Copy, CheckCheck, Loader } from 'lucide-react'

function formatDate(isoString) {
  if (!isoString) return '—'
  try {
    return new Date(isoString).toLocaleDateString('es-ES', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return isoString
  }
}

/**
 * @param {{ patient: object, professionalId: string }} props
 */
export default function ShoppingListTab({ patient, professionalId }) {
  const [list,        setList]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [regenerating,setRegenerating]= useState(false)
  const [error,       setError]       = useState(null)
  const [copied,      setCopied]      = useState(false)
  const [regenMsg,    setRegenMsg]    = useState(null)

  useEffect(() => { loadList() }, [patient?.id])

  async function loadList() {
    setLoading(true)
    setError(null)
    try {
      const { data, error: dbErr } = await supabase
        .from('nm_shopping_lists')
        .select('*')
        .eq('patient_id', patient.id)
        .eq('is_current', true)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (dbErr) throw dbErr
      setList(data || null)
    } catch (err) {
      console.error('[ShoppingListTab] loadList error:', err)
      setError('Error al cargar la lista de la compra.')
    } finally {
      setLoading(false)
    }
  }

  async function regenerate() {
    setRegenerating(true)
    setRegenMsg(null)
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://bpazmmbjjducdmxgfoum.supabase.co'
      const res = await fetch(`${SUPABASE_URL}/functions/v1/nm-shopping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: patient.id, professional_id: professionalId }),
      })
      if (!res.ok) throw new Error('Error en la generación')
      setRegenMsg('Lista regenerada correctamente ✓')
      await loadList()
    } catch (err) {
      console.error('[ShoppingListTab] regenerate error:', err)
      setRegenMsg('Error al regenerar. Inténtalo de nuevo.')
    } finally {
      setRegenerating(false)
      setTimeout(() => setRegenMsg(null), 3500)
    }
  }

  function copyToClipboard() {
    if (!list?.items) return
    const lines = CATEGORIES.flatMap(cat => {
      const items = list.items[cat.key]
      if (!items || items.length === 0) return []
      return [`\n${cat.emoji} ${cat.label.toUpperCase()}`, ...items.map(i => `  · ${i}`)]
    })
    const text = [
      `🛒 Lista de la Compra — ${patient.full_name}`,
      `Generada: ${formatDate(list.generated_at)}`,
      ...lines,
    ].join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  /* ── Categorías con items ─── */
  const activeCats = list?.items
    ? CATEGORIES.filter(cat => (list.items[cat.key]?.length || 0) > 0)
    : []
  const totalItems = activeCats.reduce(
    (acc, cat) => acc + (list?.items[cat.key]?.length || 0), 0
  )

  if (loading) {
    return <div className="flex justify-center py-10"><div className="loader" /></div>
  }

  return (
    <div className="space-y-4">

      {/* Cabecera con estado de la lista */}
      <div className="card card--elevated">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[14px] flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(45,212,191,0.10)', border: '1px solid rgba(45,212,191,0.20)' }}>
              <ShoppingCart size={18} style={{ color: '#2DD4BF' }} />
            </div>
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">
                Lista de la compra del paciente
              </p>
              {list ? (
                <>
                  <p className="text-sm font-bold text-[#E2E8F0] mt-0.5">
                    {totalItems} productos · {activeCats.length} categorías
                  </p>
                  <p className="text-[11px] text-[#4A5568] mt-0.5">
                    Generada el {formatDate(list.generated_at)}
                  </p>
                </>
              ) : (
                <p className="text-sm text-[#4A5568] mt-0.5">Sin lista generada aún</p>
              )}
            </div>
          </div>

          {/* Acciones */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {list && (
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all"
                style={{
                  background: copied ? 'rgba(45,212,191,0.12)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${copied ? 'rgba(45,212,191,0.30)' : 'rgba(255,255,255,0.08)'}`,
                  color: copied ? '#2DD4BF' : '#64748B',
                }}
              >
                {copied ? <CheckCheck size={13} /> : <Copy size={13} />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            )}
            <button
              onClick={regenerate}
              disabled={regenerating}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all"
              style={{
                background: 'rgba(45,212,191,0.10)',
                border: '1px solid rgba(45,212,191,0.20)',
                color: '#2DD4BF',
                opacity: regenerating ? 0.65 : 1,
              }}
            >
              {regenerating
                ? <><Loader size={13} className="animate-spin" /> Generando…</>
                : <><RefreshCw size={13} /> {list ? 'Regenerar' : 'Generar lista'}</>
              }
            </button>
          </div>
        </div>

        {/* Feedback de regeneración */}
        {regenMsg && (
          <p className="text-[12px] font-medium mt-3 pt-3 border-t border-[rgba(255,255,255,0.05)]"
            style={{ color: regenMsg.includes('Error') ? '#FB7185' : '#34D399' }}>
            {regenMsg}
          </p>
        )}
        {error && (
          <p className="text-[12px] font-medium mt-3" style={{ color: '#FB7185' }}>{error}</p>
        )}
      </div>

      {/* Sin lista — call to action */}
      {!list && (
        <div className="card text-center py-10">
          <p className="text-3xl mb-3">🛒</p>
          <p className="text-sm font-semibold text-[#CBD5E1] mb-1">Sin lista de la compra</p>
          <p className="text-xs text-[#4A5568] mb-4 max-w-xs mx-auto">
            La lista se genera automáticamente al asignar o modificar una dieta.
            También puedes generarla manualmente con el botón de arriba.
          </p>
        </div>
      )}

      {/* Grid de categorías — 2 columnas en pantallas anchas */}
      {list && activeCats.length > 0 && (
        <div className="grid grid-cols-1 gap-2.5">
          {activeCats.map(cat => {
            const items = list.items[cat.key] || []
            return (
              <div
                key={cat.key}
                className="card !p-0 overflow-hidden"
                style={{ borderLeft: `3px solid ${cat.color}` }}
              >
                {/* Cabecera de categoría */}
                <div
                  className="flex items-center justify-between px-4 py-2.5"
                  style={{
                    background: `${cat.color}10`,
                    borderBottom: `1px solid ${cat.color}20`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{cat.emoji}</span>
                    <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: cat.color }}>
                      {cat.label}
                    </p>
                  </div>
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: `${cat.color}15`, color: cat.color }}
                  >
                    {items.length}
                  </span>
                </div>

                {/* Items — en línea, compactos */}
                <div className="px-4 py-2.5 flex flex-wrap gap-1.5">
                  {items.map((item, idx) => (
                    <span
                      key={idx}
                      className="text-[11px] font-medium px-2.5 py-1 rounded-lg"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.07)',
                        color: '#CBD5E1',
                      }}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Aviso informativo */}
      <p className="text-[10px] text-[#333A45] text-center pb-2">
        La lista se regenera automáticamente al modificar el plan de dietas del paciente.
      </p>
    </div>
  )
}
