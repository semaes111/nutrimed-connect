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
import { ShoppingCart, Check, Copy, CheckCheck, RefreshCw } from 'lucide-react'

/* ── Configuración de categorías — orden, emojis y colores de acento ── */
const CATEGORIES = [
  { key: 'proteinas',  label: 'Proteínas',                     emoji: '🥩', color: '#FB923C' },
  { key: 'hidratos',   label: 'Hidratos de carbono complejos', emoji: '🌾', color: '#FBBF24' },
  { key: 'verduras',   label: 'Verduras y hortalizas',         emoji: '🥦', color: '#34D399' },
  { key: 'frutas',     label: 'Frutas',                        emoji: '🍎', color: '#F472B6' },
  { key: 'grasas',     label: 'Grasas saludables',             emoji: '🥑', color: '#A3E635' },
  { key: 'lacteos',    label: 'Lácteos / Alternativas',        emoji: '🥛', color: '#818CF8' },
  { key: 'legumbres',  label: 'Legumbres',                     emoji: '🫘', color: '#F97316' },
  { key: 'especias',   label: 'Especias y condimentos',        emoji: '🌿', color: '#2DD4BF' },
  { key: 'bebidas',    label: 'Bebidas',                       emoji: '💧', color: '#38BDF8' },
  { key: 'snacks',     label: 'Snacks planificados',           emoji: '🥜', color: '#E879F9' },
  { key: 'congelados', label: 'Congelados',                    emoji: '❄️', color: '#93C5FD' },
  { key: 'conservas',  label: 'Conservas y embutidos',         emoji: '🥫', color: '#FCA5A5' },
]

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

  const [list,    setList]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [checked, setChecked] = useState(new Set())   // estado local por sesión
  const [copied,  setCopied]  = useState(false)

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
      return [`\n${cat.emoji} ${cat.label.toUpperCase()}`, ...items.map(i => `  · ${i}`)]
    })
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
            onClick={loadList}
            className="mt-6 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: tc.cardInsetBg,
              border: tc.cardInsetBorder,
              color: tc.textSecondary,
            }}
          >
            <RefreshCw size={14} /> Actualizar
          </button>
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

          {/* Botón copiar */}
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
