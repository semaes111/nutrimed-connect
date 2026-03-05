/**
 * src/components/pro/helpers/index.js
 *
 * Componentes helper atómicos reutilizables en el área de profesionales.
 * Sin lógica de negocio — únicamente presentación.
 */

import { Check, AlertTriangle, Trash2, Pill } from 'lucide-react'

/** Par label/value para datos informativos del paciente */
export function InfoItem({ label, value }) {
  return (
    <div>
      <p className="text-[11px] text-[#4A5568]">{label}</p>
      <p className="text-sm text-[#CBD5E1] font-medium">{value}</p>
    </div>
  )
}

/** Ítem de antecedente familiar con indicador visual activo/inactivo */
export function FamilyItem({ label, active }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-5 h-5 rounded-md flex items-center justify-center ${active ? 'bg-[rgba(248,113,113,0.06)]' : 'bg-[#1F232B]'}`}>
        {active
          ? <Check size={12} className="text-[#FB7185]" />
          : <span className="text-[#333A45] text-xs">—</span>}
      </div>
      <span className={`text-sm ${active ? 'text-[#E2E8F0] font-medium' : 'text-[#4A5568]'}`}>{label}</span>
    </div>
  )
}

/**
 * Barra de nivel (1–10) para métricas psicológicas.
 * @param {string} label  - Etiqueta de la métrica
 * @param {number} value  - Valor de 0 a 10
 * @param {'red'|'blue'|'green'} color - Color de la barra
 */
export function LevelBar({ label, value, color }) {
  const colors = { red: 'bg-red-400', blue: 'bg-blue-400', green: 'bg-emerald-400' }
  const v = value || 0
  return (
    <div className="mb-3">
      <div className="flex justify-between mb-1">
        <span className="text-xs text-[#64748B]">{label}</span>
        <span className="text-xs font-bold text-[#CBD5E1]">{v}/10</span>
      </div>
      <div className="h-2 bg-[#252A33] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colors[color]} transition-all`} style={{ width: `${v * 10}%` }} />
      </div>
    </div>
  )
}

/**
 * Fila de medicación individual con controles de activar/desactivar y eliminar.
 * @param {object}   med      - Registro de nm_medications
 * @param {Function} onToggle - Callback (med) => void para cambiar is_active
 * @param {Function} onDelete - Callback (med) => void para eliminar
 */
export function MedRow({ med, onToggle, onDelete }) {
  return (
    <div className="card !p-3 flex items-center gap-3">
      <Pill size={16} className={med.is_active ? 'text-[#C084FC]' : 'text-[#333A45]'} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#E2E8F0]">{med.medication_name}</p>
        <p className="text-[11px] text-[#4A5568]">
          {[med.dosage, med.frequency, med.clicks ? `${med.clicks} clicks` : null].filter(Boolean).join(' · ')}
        </p>
      </div>
      {med.side_effects && (
        <AlertTriangle size={14} className="text-amber-400 shrink-0" title={med.side_effects} />
      )}
      <button
        onClick={() => onToggle(med)}
        className={`text-xs px-2 py-1 rounded-lg transition ${
          med.is_active
            ? 'bg-[rgba(248,113,113,0.06)] text-[#FB7185] hover:bg-red-100'
            : 'bg-[rgba(52,211,153,0.06)] text-[#34D399] hover:bg-green-100'
        }`}
      >
        {med.is_active ? 'Desactivar' : 'Activar'}
      </button>
      <button onClick={() => onDelete(med)} className="text-[#333A45] hover:text-red-400 p-1">
        <Trash2 size={13} />
      </button>
    </div>
  )
}
