/**
 * src/components/patient/ScannerResult.jsx
 *
 * Responsabilidad: mostrar el veredicto del análisis de etiqueta.
 * Doble criterio: producto en dieta semanal + azúcares ≤ 4g/100g.
 *
 * Props recibidas desde LabelScanner.jsx tras la respuesta de nm-scanner.
 * Usa tokens de usePageTheme — compatible con ambos temas.
 */

import { usePageTheme } from '../../lib/usePageTheme'

const REASONS = {
  approved: {
    icon: '✅',
    title: 'CUMPLE LOS CRITERIOS',
    subtitleFn: (matched) =>
      matched ? `Autorizado en tu dieta · Coincide con: ${matched}` : 'Autorizado en tu dieta',
    colorKey: 'success',
  },
  not_in_diet: {
    icon: '❌',
    title: 'NO AUTORIZADO EN TU DIETA',
    subtitleFn: () => 'Este producto no forma parte de tu plan nutricional esta semana',
    colorKey: 'danger',
  },
  sugar_too_high: {
    icon: '❌',
    title: 'EXCESO DE AZÚCAR',
    subtitleFn: () => 'El producto está en tu dieta pero supera el límite de azúcar',
    colorKey: 'danger',
  },
  both_fail: {
    icon: '❌',
    title: 'NO CUMPLE LOS CRITERIOS',
    subtitleFn: () => 'No está en tu dieta y supera el límite de azúcar',
    colorKey: 'danger',
  },
  unreadable: {
    icon: '⚠️',
    title: 'ETIQUETA ILEGIBLE',
    subtitleFn: () => 'No se pudo leer el valor de azúcares. Asegúrate de que la foto sea nítida.',
    colorKey: 'warning',
  },
  no_diet_assigned: {
    icon: '⚠️',
    title: 'SIN DIETA ASIGNADA',
    subtitleFn: () => 'Tu dietista aún no ha configurado tu plan nutricional.',
    colorKey: 'warning',
  },
}

export default function ScannerResult({
  allowed,
  reason,
  sugar_g_per_100,
  threshold,
  product_category,
  matched_food,
  confidence,
}) {
  const tc = usePageTheme()

  const config = REASONS[reason] || REASONS['unreadable']
  const colorKey = config.colorKey

  const accentColor =
    colorKey === 'success' ? tc.accentGreen
    : colorKey === 'danger'  ? tc.accentRed
    : tc.textWarning

  const textColor =
    colorKey === 'success' ? tc.textSuccess
    : colorKey === 'danger'  ? tc.textDanger
    : tc.textWarning

  const bgColor =
    colorKey === 'success'
      ? tc.isDark ? 'rgba(52,211,153,0.08)' : 'rgba(6,78,59,0.07)'
      : colorKey === 'danger'
      ? tc.isDark ? 'rgba(251,113,133,0.08)' : 'rgba(159,18,57,0.07)'
      : tc.isDark ? 'rgba(252,211,77,0.08)'  : 'rgba(146,64,14,0.07)'

  const borderColor =
    colorKey === 'success'
      ? tc.isDark ? 'rgba(52,211,153,0.22)' : 'rgba(6,78,59,0.20)'
      : colorKey === 'danger'
      ? tc.isDark ? 'rgba(251,113,133,0.22)' : 'rgba(159,18,57,0.20)'
      : tc.isDark ? 'rgba(252,211,77,0.22)'  : 'rgba(146,64,14,0.20)'

  return (
    <div
      className="rounded-[22px] overflow-hidden"
      style={{
        background: tc.cardBg,
        border: tc.cardBorder,
        boxShadow: tc.cardShadow,
      }}
    >
      {/* ── Franja de color superior ── */}
      <div
        className="h-1.5 w-full"
        style={{ background: accentColor }}
      />

      {/* ── Cuerpo del resultado ── */}
      <div className="px-5 py-6 flex flex-col items-center gap-4 text-center">

        {/* Icono grande */}
        <span
          className="text-[52px] leading-none"
          style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.25))' }}
        >
          {config.icon}
        </span>

        {/* Título del veredicto */}
        <p
          className="text-[15px] font-black tracking-[0.06em] uppercase"
          style={{ color: textColor }}
        >
          {config.title}
        </p>

        {/* Badge azúcar — solo si tenemos el valor */}
        {sugar_g_per_100 !== null && (
          <div
            className="rounded-[14px] px-5 py-3 flex flex-col items-center gap-1"
            style={{ background: bgColor, border: `1px solid ${borderColor}` }}
          >
            <p
              className="text-[28px] font-black leading-none"
              style={{ color: accentColor }}
            >
              {sugar_g_per_100}g
            </p>
            <p
              className="text-[11px] font-semibold uppercase tracking-widest"
              style={{ color: tc.textMuted }}
            >
              azúcares / 100g
            </p>
          </div>
        )}

        {/* Umbral de referencia */}
        {threshold !== undefined && (
          <p
            className="text-[11px] font-medium"
            style={{ color: tc.textDimmed }}
          >
            🎯 Umbral máximo: ≤ {threshold}g azúcares / 100g
          </p>
        )}

        {/* Producto detectado */}
        {product_category && (
          <div
            className="rounded-[10px] px-4 py-2 w-full"
            style={{
              background: tc.cardInsetBg,
              border: tc.cardInsetBorder,
            }}
          >
            <p
              className="text-[10px] font-bold uppercase tracking-widest mb-0.5"
              style={{ color: tc.textDimmed }}
            >
              Producto detectado
            </p>
            <p
              className="text-[13px] font-semibold capitalize"
              style={{ color: tc.textSecondary }}
            >
              {product_category}
            </p>
          </div>
        )}

        {/* Subtítulo explicativo */}
        <p
          className="text-[12px] font-medium leading-relaxed"
          style={{ color: tc.textMuted }}
        >
          {config.subtitleFn(matched_food)}
        </p>

        {/* Aviso de confianza baja */}
        {confidence === 'medium' && (
          <p
            className="text-[11px] font-medium px-3 py-2 rounded-[10px]"
            style={{
              color: tc.textWarning,
              background: tc.isDark ? 'rgba(252,211,77,0.07)' : 'rgba(146,64,14,0.07)',
              border: `1px solid ${tc.isDark ? 'rgba(252,211,77,0.18)' : 'rgba(146,64,14,0.18)'}`,
            }}
          >
            ⚠️ Lectura con dudas. Verifica el dato en la etiqueta manualmente.
          </p>
        )}
      </div>
    </div>
  )
}
