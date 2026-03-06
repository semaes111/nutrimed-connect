/**
 * src/components/patient/NextAppointmentCountdown.jsx
 *
 * Widget de cuenta atrás para la próxima consulta.
 * Solo renderiza si appointmentDate es un valor válido.
 * Usa useCountdown para actualizarse en tiempo real.
 *
 * Props:
 *   appointmentDate {string|null}  ISO string de next_appointment
 *   tc              {object}       Tokens de tema de usePageTheme
 */
import { CalendarClock } from 'lucide-react'
import { useCountdown } from '../../hooks/useCountdown'

/* Devuelve el color de acento según urgencia */
function urgencyColor(days, expired, isDark) {
  if (expired) return isDark ? '#FB7185' : '#9F1239'
  if (days < 7)  return isDark ? '#FB7185' : '#9F1239'   // rojo
  if (days < 14) return isDark ? '#FBBF24' : '#92400E'   // ámbar
  return isDark ? '#2DD4BF' : '#0F766E'                   // cyan/brand
}

/* Bloque individual dígito */
function Digit({ value, label, color, tc }) {
  const pad = String(value).padStart(2, '0')
  return (
    <div className="flex flex-col items-center gap-0.5" style={{ minWidth: 36 }}>
      <div
        className="rounded-xl flex items-center justify-center"
        style={{
          width: 44, height: 40,
          background: `${color}14`,
          border: `1px solid ${color}30`,
        }}
      >
        <span
          className="text-[22px] font-bold tabular-nums leading-none"
          style={{ color, fontFamily: 'var(--font-display, monospace)' }}
        >
          {pad}
        </span>
      </div>
      <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: tc.textFaint }}>
        {label}
      </span>
    </div>
  )
}

export default function NextAppointmentCountdown({ appointmentDate, tc }) {
  const { days, hours, minutes, seconds, expired, active } = useCountdown(appointmentDate)

  if (!active) return null

  const color = urgencyColor(days, expired, tc.isDark)

  /* Formatear la fecha legible en español */
  let humanDate = ''
  if (appointmentDate) {
    try {
      humanDate = new Date(appointmentDate).toLocaleString('es-ES', {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit',
      })
    } catch { humanDate = '' }
  }

  return (
    <div
      className="mb-4 rounded-[20px] overflow-hidden"
      style={{
        background: tc.cardBg,
        border: tc.cardBorder,
        boxShadow: tc.cardShadow,
      }}
    >
      {/* Cabecera */}
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{ borderBottom: `1px solid ${color}20`, background: `${color}08` }}
      >
        <CalendarClock size={14} style={{ color }} />
        <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color }}>
          Próxima consulta
        </span>
      </div>

      {/* Cuerpo */}
      <div className="px-4 py-3">
        {expired ? (
          <p className="text-xs font-semibold text-center" style={{ color }}>
            Consulta pendiente de reprogramación
          </p>
        ) : (
          <>
            {/* Dígitos cuenta atrás */}
            <div className="flex items-end justify-center gap-2">
              <Digit value={days}    label="días"  color={color} tc={tc} />
              <span className="text-[20px] font-bold mb-4 leading-none" style={{ color, opacity: 0.6 }}>:</span>
              <Digit value={hours}   label="horas" color={color} tc={tc} />
              <span className="text-[20px] font-bold mb-4 leading-none" style={{ color, opacity: 0.6 }}>:</span>
              <Digit value={minutes} label="min"   color={color} tc={tc} />
              <span className="text-[20px] font-bold mb-4 leading-none" style={{ color, opacity: 0.6 }}>:</span>
              <Digit value={seconds} label="seg"   color={color} tc={tc} />
            </div>
            {/* Fecha legible */}
            {humanDate && (
              <p className="text-[11px] font-medium text-center mt-2 capitalize" style={{ color: tc.textMuted }}>
                {humanDate}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
