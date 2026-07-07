/**
 * src/pages/patient/ShoppingList.jsx
 *
 * Responsabilidad: mostrar la lista de la compra semanal generada por IA
 * del paciente, basada en su plan de dieta activo.
 *
 * Datos: nm_shopping_lists (is_current=true, patient_id=profile.id)
 * Estado "tachado": local por sesión (useState), no persiste en BD.
 */

import { useState, useEffect } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'
import PatientLayout from '../../components/layout/PatientLayout'
import { usePageTheme } from '../../lib/usePageTheme'
import { SHOPPING_CATEGORIES as CATEGORIES } from '../../lib/dietConfig'
import { ShoppingCart, Check, Copy, CheckCheck, RefreshCw, Loader } from 'lucide-react'

/* ── Formateador de fecha legible ─────────────────────────────────── */
function formatDate(isoString) {
  if (!isoString) return ''
  try {
    return new Date(isoString).toLocaleDateString('es-ES', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
  } catch {
    return isoString
  }
}

/* ── Tarjeta de categoría ────────────────────────────────────────── */
function CategoryCard({ category, items, checked, onToggle, tc }) {
  if (!items || items.length === 0) return null

  const checkedCount = items.filter((_, i) => checked.has(`${category.key}-${i}`)).length
  const allDone      = checkedCount === items.length

  return (
    <div
      className="rounded-[18px] overflow-hidden"
      style={{
        background: tc.cardBg,
        border: tc.cardBorder,
        boxShadow: tc.cardShadow,
        borderLeft: `3.5px solid ${category.color}`,
      }}
    >
      {/* Cabecera de categoría */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{
          background: `${category.color}${tc.isDark ? '0D' : '0A'}`,
          borderBottom: `1px solid ${category.color}${tc.isDark ? '20' : '18'}`,
        }}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-xl leading-none" style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.2))' }}>
            {category.emoji}
          </span>
          <p
            className="text-[12px] font-bold uppercase tracking-wider"
            style={{ color: category.color }}
          >
            {category.label}
          </p>
        </div>
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{
            background: allDone
              ? `${category.color}25`
              : `${category.color}10`,
            color: category.color,
          }}
        >
          {checkedCount}/{items.length}
        </span>
      </div>

      {/* Lista de items */}
      <div className="px-4 py-2.5 space-y-0.5">
        {items.map((item, idx) => {
          const id      = `${category.key}-${idx}`
          const isDone  = checked.has(id)
          return (
            <button
              key={id}
              onClick={() => onToggle(id)}
              className="w-full flex items-center gap-3 py-2 px-1 rounded-xl transition-all text-left"
              style={{
                background: isDone
                  ? `${category.color}08`
                  : 'transparent',
              }}
            >
              {/* Checkbox visual */}
              <div
                className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-all"
                style={{
                  background: isDone ? category.color : 'transparent',
                  border: `1.5px solid ${isDone ? category.color : tc.isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)'}`,
                }}
              >
                {isDone && <Check size={11} color="#fff" strokeWidth={3} />}
              </div>

              {/* Texto del item */}
              <span
                className="text-[13px] font-medium leading-tight transition-all"
                style={{
                  color: isDone ? tc.textFaint : tc.textBody,
                  textDecoration: isDone ? 'line-through' : 'none',
                  textDecorationColor: tc.textFaint,
                }}
              >
                {item}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ═══════════════════════════════════════════════════════════════════ */
export default function ShoppingList() {
  const { profile } = useAuth()
  const tc = usePageTheme()

  const [list,      setList]      = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [checked,   setChecked]   = useState(new Set())   // estado local por sesión
  const [copied,    setCopied]    = useState(false)
  const [updating,  setUpdating]  = useState(false)       // spinner regeneración
  const [updateMsg, setUpdateMsg] = useState(null)        // feedback éxito/error/sin dieta
  const [hasDiet,   setHasDiet]   = useState(null)        // null=sin comprobar, true/false

  useEffect(() => { if (profile?.id) loadList() }, [profile?.id])

  async function loadList() {
    try {
      setLoading(true)
      setError(null)
      const { data, error: dbErr } = await supabase
        .from('nm_shopping_lists')
        .select('*')
        .eq('patient_id', profile.id)
        .eq('is_current', true)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (dbErr) throw dbErr
      setList(data || null)
      setChecked(new Set()) // resetear checkboxes al cargar
    } catch (err) {
      console.error('[ShoppingList] loadList error:', err)
      setError('Error al cargar la lista. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Verifica si el paciente tiene dieta asignada antes de llamar a nm-shopping.
   * Sin dieta → mensaje informativo (amarillo), sin llamada a la Edge Function.
   * Con dieta → llama a nm-shopping → recarga la lista desde BD.
   */
  async function checkDietAndUpdate() {
    setUpdating(true)
    setUpdateMsg(null)
    try {
      // 1 — Verificar si hay planes de dieta activos para este paciente
      const { count, error: countErr } = await supabase
        .from('nm_diet_plans')
        .select('id', { count: 'exact', head: true })
        .eq('patient_id', profile.id)
        .eq('is_active', true)

      if (countErr) throw countErr

      if (!count || count === 0) {
        // Sin dieta asignada — feedback amarillo, no llamar a la Edge Function
        setHasDiet(false)
        setUpdateMsg('Tu dietista aún no ha configurado tu plan de alimentación.')
        setUpdating(false)
        setTimeout(() => setUpdateMsg(null), 5000)
        return
      }

      // 2 — Hay dieta → llamar a nm-shopping para regenerar
      setHasDiet(true)
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://bpazmmbjjducdmxgfoum.supabase.co'
      const res = await fetch(`${SUPABASE_URL}/functions/v1/nm-shopping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: profile.id }),
      })

      if (!res.ok) throw new Error(`nm-shopping status ${res.status}`)

      // 3 — Recargar lista desde BD (loadList ya hace setChecked(new Set()))
      await loadList()
      setUpdateMsg('Lista actualizada ✓')
      setTimeout(() => setUpdateMsg(null), 4000)

    } catch (err) {
      console.error('[ShoppingList] checkDietAndUpdate error:', err)
      setUpdateMsg('Error al actualizar. Inténtalo de nuevo.')
      setTimeout(() => setUpdateMsg(null), 4000)
    } finally {
      setUpdating(false)
    }
  }

  function toggleItem(id) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function copyToClipboard() {
    if (!list?.items) return
    const lines = CATEGORIES.flatMap(cat => {
      const items = list.items[cat.key]
      if (!items || items.length === 0) return []
      const selected = items.filter((_, idx) => checked.has(`${cat.key}-${idx}`))
      if (selected.length === 0) return []
      return [`\n${cat.emoji} ${cat.label.toUpperCase()}`, ...selected.map(i => `  · ${i}`)]
    })
    if (lines.length === 0) return
    const text = ['🛒 Lista de la Compra — NutriMed Connect', ...lines].join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  /* ── Total de items de la lista ─── */
  const totalItems = list?.items
    ? CATEGORIES.reduce((acc, cat) => acc + (list.items[cat.key]?.length || 0), 0)
    : 0
  const totalChecked = checked.size

  /* ── Categorías con items (filtrar vacías) ─── */
  const activeCats = list?.items
    ? CATEGORIES.filter(cat => (list.items[cat.key]?.length || 0) > 0)
    : []

  /* ── Styles ─── */
  const NEU_CARD = {
    background: tc.cardBg,
    border: tc.cardBorder,
    boxShadow: tc.cardShadow,
    borderRadius: 20,
  }

  /* ── Render: loading ─── */
  if (loading) {
    return (
      <PatientLayout title="Lista de la Compra" subtitle="🛒 Nutrición">
        <div className="flex justify-center py-20">
          <div className="loader" />
        </div>
      </PatientLayout>
    )
  }

  /* ── Render: error ─── */
  if (error) {
    return (
      <PatientLayout title="Lista de la Compra" subtitle="🛒 Nutrición">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-sm font-medium mb-4" style={{ color: tc.textDanger }}>{error}</p>
          <button onClick={loadList} className="btn btn-primary btn-sm">Reintentar</button>
        </div>
      </PatientLayout>
    )
  }

  /* ── Render: sin lista aún ─── */
  if (!list) {
    return (
      <PatientLayout title="Lista de la Compra" subtitle="🛒 Nutrición">
        <div className="flex flex-col items-center justify-center py-16 text-center px-6">
          <div
            className="w-20 h-20 rounded-[24px] flex items-center justify-center mb-5"
            style={{ background: tc.cardInsetBg, border: tc.cardInsetBorder }}
          >
            <ShoppingCart size={36} style={{ color: tc.textAccent }} />
          </div>
          <p className="text-base font-bold mb-2" style={{ color: tc.textPrimary }}>
            Lista en preparación
          </p>
          <p className="text-sm leading-relaxed" style={{ color: tc.textMuted }}>
            Tu lista de la compra se generará automáticamente cuando tu dietista configure o actualice tu plan de alimentación.
          </p>
          <button
            onClick={checkDietAndUpdate}
            disabled={updating}
            className="mt-6 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: tc.isDark ? 'rgba(45,212,191,0.10)' : 'rgba(13,148,136,0.08)',
              border: `1px solid ${tc.isDark ? 'rgba(45,212,191,0.22)' : 'rgba(13,148,136,0.18)'}`,
              color: tc.textAccent,
              opacity: updating ? 0.65 : 1,
            }}
          >
            {updating
              ? <><Loader size={14} className="animate-spin" /> Generando...</>
              : <><RefreshCw size={14} /> Generar mi lista</>
            }
          </button>
          {updateMsg && (
            <p
              className="mt-3 text-[12px] font-semibold px-4 py-2 rounded-xl"
              style={{
                color:      updateMsg.includes('✓') ? '#34D399'
                          : updateMsg.includes('aún no') ? '#FBBF24'
                          : '#FB7185',
                background: updateMsg.includes('✓') ? 'rgba(52,211,153,0.08)'
                          : updateMsg.includes('aún no') ? 'rgba(251,191,36,0.08)'
                          : 'rgba(251,113,133,0.08)',
                border: `1px solid ${
                          updateMsg.includes('✓') ? 'rgba(52,211,153,0.20)'
                          : updateMsg.includes('aún no') ? 'rgba(251,191,36,0.20)'
                          : 'rgba(251,113,133,0.20)'}`,
              }}
            >
              {updateMsg}
            </p>
          )}
        </div>
      </PatientLayout>
    )
  }

  /* ── Render principal ─── */
  return (
    <PatientLayout title="Lista de la Compra" subtitle="🛒 Nutrición">

      {/* ═══ HERO — Cabecera con resumen ═══ */}
      <div className="mb-4 rounded-[22px] overflow-hidden" style={NEU_CARD}>
        {/* Franja superior teal */}
        <div
          className="px-4 py-3 flex items-center justify-between"
          style={{
            background: tc.isDark
              ? 'linear-gradient(135deg, rgba(45,212,191,0.12) 0%, rgba(45,212,191,0.04) 100%)'
              : 'linear-gradient(135deg, rgba(13,148,136,0.09) 0%, rgba(13,148,136,0.03) 100%)',
            borderBottom: `1px solid ${tc.isDark ? 'rgba(45,212,191,0.15)' : 'rgba(13,148,136,0.12)'}`,
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-[12px] flex items-center justify-center"
              style={{
                background: tc.isDark ? 'rgba(45,212,191,0.15)' : 'rgba(13,148,136,0.12)',
                border: `1px solid ${tc.isDark ? 'rgba(45,212,191,0.25)' : 'rgba(13,148,136,0.20)'}`,
              }}
            >
              <ShoppingCart size={17} style={{ color: tc.textAccent }} />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: tc.textAccent }}>
                Lista semanal
              </p>
              <p className="text-[10px] font-medium" style={{ color: tc.textMuted }}>
                {formatDate(list.generated_at)}
              </p>
            </div>
          </div>

          {/* Botones: Actualizar + Copiar */}
          <div className="flex items-center gap-2">
            {/* Botón Actualizar lista */}
            <button
              onClick={checkDietAndUpdate}
              disabled={updating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all"
              style={{
                background: updating
                  ? `rgba(45,212,191,${tc.isDark ? '0.18' : '0.12'})`
                  : tc.isDark ? 'rgba(45,212,191,0.10)' : 'rgba(13,148,136,0.08)',
                border: `1px solid ${tc.isDark ? 'rgba(45,212,191,0.22)' : 'rgba(13,148,136,0.18)'}`,
                color: tc.textAccent,
                opacity: updating ? 0.75 : 1,
              }}
              title="Regenerar lista de la compra con tu dieta actual"
            >
              {updating
                ? <><Loader size={11} className="animate-spin" /> Generando...</>
                : <><RefreshCw size={11} /> Actualizar</>
              }
            </button>

            {/* Botón Copiar */}
            <button
              onClick={copyToClipboard}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all"
              style={{
                background: copied
                  ? `rgba(45,212,191,${tc.isDark ? '0.18' : '0.12'})`
                  : tc.cardInsetBg,
                border: copied
                  ? `1px solid rgba(45,212,191,${tc.isDark ? '0.35' : '0.25'})`
                  : tc.cardInsetBorder,
                color: copied ? tc.textAccent : tc.textSecondary,
              }}
            >
              {copied
                ? <><CheckCheck size={12} /> Copiado</>
                : <><Copy size={12} /> Copiar</>
              }
            </button>
          </div>
        </div>

        {/* Barra de progreso */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold" style={{ color: tc.textSecondary }}>
              Progreso de compra
            </p>
            <p className="text-[11px] font-bold" style={{ color: tc.textAccent }}>
              {totalChecked}/{totalItems} productos
            </p>
          </div>
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ background: tc.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: totalItems > 0 ? `${(totalChecked / totalItems) * 100}%` : '0%',
                background: totalChecked === totalItems && totalItems > 0
                  ? 'linear-gradient(90deg, #34D399, #2DD4BF)'
                  : 'linear-gradient(90deg, #2DD4BF, #38BDF8)',
              }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <p className="text-[10px] font-medium" style={{ color: tc.textFaint }}>
              {activeCats.length} categorías · {totalItems} productos
            </p>
            {totalChecked === totalItems && totalItems > 0 && (
              <p className="text-[10px] font-bold" style={{ color: '#34D399' }}>
                ✓ Lista completa 🎉
              </p>
            )}
          </div>

          {/* Feedback de actualización */}
          {updateMsg && (
            <div
              className="mt-2.5 px-3 py-2 rounded-xl text-[11px] font-semibold"
              style={{
                color:      updateMsg.includes('✓') ? '#34D399'
                          : updateMsg.includes('aún no') ? '#FBBF24'
                          : '#FB7185',
                background: updateMsg.includes('✓') ? 'rgba(52,211,153,0.08)'
                          : updateMsg.includes('aún no') ? 'rgba(251,191,36,0.08)'
                          : 'rgba(251,113,133,0.08)',
                border: `1px solid ${
                          updateMsg.includes('✓') ? 'rgba(52,211,153,0.18)'
                          : updateMsg.includes('aún no') ? 'rgba(251,191,36,0.18)'
                          : 'rgba(251,113,133,0.18)'}`,
              }}
            >
              {updateMsg}
            </div>
          )}
        </div>
      </div>

      {/* ═══ CATEGORÍAS ═══ */}
      <div className="space-y-3 mb-4">
        {activeCats.map(cat => (
          <CategoryCard
            key={cat.key}
            category={cat}
            items={list.items[cat.key]}
            checked={checked}
            onToggle={toggleItem}
            tc={tc}
          />
        ))}
      </div>

      {/* ═══ AVISO INFERIOR ═══ */}
      <div
        className="flex items-center gap-2.5 px-4 py-3 rounded-[16px] mb-2"
        style={{ background: tc.cardInsetBg, border: tc.cardInsetBorder }}
      >
        <RefreshCw size={13} style={{ color: tc.textFaint, flexShrink: 0 }} />
        <p className="text-[11px] font-medium leading-relaxed" style={{ color: tc.textFaint }}>
          La lista se regenera automáticamente cada vez que tu dietista actualiza tu plan de alimentación.
        </p>
      </div>

    </PatientLayout>
  )
}
