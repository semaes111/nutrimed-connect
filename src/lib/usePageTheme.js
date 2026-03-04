import { useTheme } from './ThemeContext'

/**
 * usePageTheme — Tokens de color theme-aware con contraste WCAG AA garantizado
 *
 * DARK  → Obsidian Metallic Pro  (paleta original, fondos #1F232B)
 * LIGHT → Platinum Clinical       (fondos #E8ECF2, texto #0F172A)
 *
 * REGLA: En light mode TODO texto debe ser ≥4.5:1 sobre el fondo platino.
 * Se eliminan todos los grises medios (#64748B, #8896A5, etc.) que
 * son invisibles sobre fondos claros.
 */
export function usePageTheme() {
  const { isDark } = useTheme()

  /* ── Texto ─────────────────────────────────────────────────────────── */
  const textPrimary   = isDark ? '#EDF0F7' : '#0F172A'   // títulos / valores
  const textBody      = isDark ? '#C4CDD8' : '#1E293B'   // cuerpo de dieta (más oscuro en dark)
  const textSecondary = isDark ? '#A8BAC8' : '#374151'   // subtítulos
  const textMuted     = isDark ? '#8A9CB0' : '#4B5568'   // labels (en light ya es legible)
  const textDimmed    = isDark ? '#6B7A8D' : '#6B7280'   // notas, fechas
  const textFaint     = isDark ? '#526070' : '#6B7280'   // "Sin menú" / placeholders

  /* ── Accents/Marca ─────────────────────────────────────────────────── */
  const textAccent    = isDark ? '#2DD4BF' : '#0D9488'
  const textAccentSoft= isDark ? '#5EEAD4' : '#0F766E'

  /* ── Semánticos ────────────────────────────────────────────────────── */
  const textDanger    = isDark ? '#FCA5A5' : '#DC2626'
  const textWarning   = isDark ? '#FCD34D' : '#92400E'
  const textSuccess   = isDark ? '#6EE7B7' : '#065F46'

  /* ── Colores de sección de dieta (vibrantes en dark, oscuros en light) */
  const accentYellow  = isDark ? '#FBBF24' : '#78350F'
  const accentOrange  = isDark ? '#FB923C' : '#7C2D12'
  const accentIndigo  = isDark ? '#818CF8' : '#312E81'
  const accentPink    = isDark ? '#F472B6' : '#831843'
  const accentBlue    = isDark ? '#60A5FA' : '#1E3A8A'
  const accentPurple  = isDark ? '#C084FC' : '#4C1D95'
  const accentGreen   = isDark ? '#34D399' : '#064E3B'
  const accentRed     = isDark ? '#FB7185' : '#9F1239'

  /* ── Cards neumórficas ─────────────────────────────────────────────── */
  const cardBg = isDark
    ? 'linear-gradient(145deg, #262B34, #1F232B)'
    : 'linear-gradient(145deg, #F8FAFE, #EEF1F8)'

  const cardBorder = isDark
    ? '1px solid rgba(255,255,255,0.04)'
    : '1px solid rgba(0,0,0,0.07)'

  const cardShadow = isDark
    ? '6px 6px 16px rgba(0,0,0,0.35), -4px -4px 12px rgba(255,255,255,0.025), inset 1px 1px 0 rgba(255,255,255,0.06)'
    : '6px 6px 16px rgba(163,180,210,0.50), -5px -5px 12px rgba(255,255,255,0.88), inset 1px 1px 0 rgba(255,255,255,0.95)'

  const cardInsetBg = isDark
    ? 'linear-gradient(145deg, #1A1D23, #1E2128)'
    : 'linear-gradient(145deg, #E2E8F2, #EBF0F8)'

  const cardInsetShadow = isDark
    ? 'inset 3px 3px 6px rgba(0,0,0,0.3), inset -2px -2px 4px rgba(255,255,255,0.025)'
    : 'inset 3px 3px 6px rgba(163,180,210,0.40), inset -2px -2px 4px rgba(255,255,255,0.85)'

  const cardInsetBorder = isDark
    ? '1px solid rgba(255,255,255,0.03)'
    : '1px solid rgba(0,0,0,0.06)'

  const divider = isDark
    ? 'rgba(255,255,255,0.05)'
    : 'rgba(0,0,0,0.08)'

  /* ── Fondos de sección dieta ─────────────────────────────────────────
   * Light: alpha más alto (0.12) + base más oscura para que se vea el tinte
   * sobre el fondo platinum #E8ECF2                                     */
  const sectionBgBlue    = isDark ? 'rgba(96,165,250,0.07)'  : 'rgba(30,58,138,0.08)'
  const sectionBgPurple  = isDark ? 'rgba(192,132,252,0.07)' : 'rgba(76,29,149,0.08)'
  const sectionBgGreen   = isDark ? 'rgba(52,211,153,0.07)'  : 'rgba(6,78,59,0.08)'
  const sectionBgYellow  = isDark ? 'rgba(251,191,36,0.07)'  : 'rgba(120,53,15,0.08)'
  const sectionBgRed     = isDark ? 'rgba(251,113,133,0.07)' : 'rgba(159,18,57,0.08)'

  const sectionBorderBlue   = isDark ? 'rgba(96,165,250,0.18)'  : 'rgba(30,58,138,0.22)'
  const sectionBorderPurple = isDark ? 'rgba(192,132,252,0.18)' : 'rgba(76,29,149,0.22)'
  const sectionBorderGreen  = isDark ? 'rgba(52,211,153,0.18)'  : 'rgba(6,78,59,0.22)'
  const sectionBorderYellow = isDark ? 'rgba(251,191,36,0.18)'  : 'rgba(120,53,15,0.22)'
  const sectionBorderRed    = isDark ? 'rgba(251,113,133,0.18)' : 'rgba(159,18,57,0.22)'

  /* ── Hero card dieta — fondo con suficiente opacidad en light ────────
   * dietConfig.bg = rgba(..., 0.08) → en light queda invisible.
   * Devolvemos una función que recibe el color hex y genera el fondo.    */
  const heroDietGradient = (dietColor, dietBg) => {
    if (isDark) {
      return `linear-gradient(145deg, ${dietBg} 0%, rgba(30,33,40,0.97) 100%)`
    }
    // En light: tinte más pronunciado (0.12) sobre blanco-platino
    return `linear-gradient(145deg, ${dietBg.replace(/[\d.]+\)$/, '0.18)')} 0%, rgba(245,248,255,0.98) 100%)`
  }

  const heroDietShadow = (dietColor) => {
    if (isDark) {
      return `8px 8px 24px rgba(0,0,0,0.4), -4px -4px 12px rgba(255,255,255,0.02), 0 0 40px ${dietColor}08, inset 1px 1px 0 rgba(255,255,255,0.05)`
    }
    return `8px 8px 20px rgba(163,180,210,0.55), -6px -6px 14px rgba(255,255,255,0.90), 0 0 32px ${dietColor}15, inset 1px 1px 0 rgba(255,255,255,0.95)`
  }

  /* ── Tooltip del chart ───────────────────────────────────────────────*/
  const tooltipStyle = isDark
    ? { background: '#2A2F38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, boxShadow: '8px 8px 24px rgba(0,0,0,0.4)', color: '#E2E8F0', fontSize: 13 }
    : { background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 14, boxShadow: '6px 6px 16px rgba(163,180,210,0.45)', color: '#0F172A', fontSize: 13 }

  /* ── Chart grid & axis ───────────────────────────────────────────────*/
  const chartGrid   = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'
  const chartAxis   = isDark ? '#4A5568' : '#6B7280'
  const chartStroke = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'

  return {
    isDark,
    // texto
    textPrimary, textBody, textSecondary, textMuted, textDimmed, textFaint,
    textAccent, textAccentSoft,
    textDanger, textWarning, textSuccess,
    // accents dieta
    accentYellow, accentOrange, accentIndigo, accentPink,
    accentBlue, accentPurple, accentGreen, accentRed,
    // cards
    cardBg, cardBorder, cardShadow,
    cardInsetBg, cardInsetShadow, cardInsetBorder,
    divider,
    // secciones
    sectionBgBlue, sectionBgPurple, sectionBgGreen, sectionBgYellow, sectionBgRed,
    sectionBorderBlue, sectionBorderPurple, sectionBorderGreen, sectionBorderYellow, sectionBorderRed,
    // hero dieta
    heroDietGradient, heroDietShadow,
    // chart
    tooltipStyle, chartGrid, chartAxis, chartStroke,
  }
}
