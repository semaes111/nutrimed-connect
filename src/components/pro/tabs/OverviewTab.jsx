/**
 * src/components/pro/tabs/OverviewTab.jsx
 *
 * Responsabilidad: visualización del resumen general del paciente.
 * Sin lógica de negocio ni llamadas a Supabase — solo renderizado.
 */

import { Scale, Brain, Heart, Activity, Calendar } from 'lucide-react'
import { formatDate } from '../../../lib/diet/utils.js'
import { InfoItem, FamilyItem, LevelBar } from '../helpers/index.jsx'

/**
 * Tab de información general del paciente.
 * @param {{ patient: object }} props
 */
export default function OverviewTab({ patient }) {
  const fam = patient.family_history || {}

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Peso */}
      <div className="card">
        <p className="text-xs font-semibold text-[#64748B] mb-3 flex items-center gap-2">
          <Scale size={14} /> Peso
        </p>
        <div className="grid grid-cols-2 gap-3">
          <InfoItem label="Actual"      value={patient.current_weight  ? `${patient.current_weight} kg`   : '—'} />
          <InfoItem label="Inicial"     value={patient.initial_weight  ? `${patient.initial_weight} kg`   : '—'} />
          <InfoItem label="Objetivo"    value={patient.target_weight   ? `${patient.target_weight} kg`    : '—'} />
          <InfoItem label="Mejor 5 años" value={patient.best_weight_5_years ? `${patient.best_weight_5_years} kg` : '—'} />
          {patient.height && <InfoItem label="Altura" value={`${patient.height} cm`} />}
        </div>
      </div>

      {/* Nivel psicológico */}
      <div className="card">
        <p className="text-xs font-semibold text-[#64748B] mb-3 flex items-center gap-2">
          <Brain size={14} /> Nivel psicológico
        </p>
        <LevelBar label="Estrés"              value={patient.stress_level}       color="red"   />
        <LevelBar label="Control alimentario" value={patient.food_control_level} color="blue"  />
        <LevelBar label="Motivación"          value={patient.motivation_level}   color="green" />
      </div>

      {/* Historial médico */}
      <div className="card">
        <p className="text-xs font-semibold text-[#64748B] mb-3 flex items-center gap-2">
          <Heart size={14} /> Historial médico
        </p>
        <div className="space-y-2 text-sm">
          <InfoItem label="Enfermedades"             value={patient.has_diseases ? (patient.diseases_description || 'Sí') : 'No'} />
          <InfoItem label="Ejercicio"                value={patient.does_exercise ? 'Sí' : 'No'} />
          <InfoItem label="Problemas ginecológicos"  value={patient.gynecological_problems ? 'Sí' : 'No'} />
          <InfoItem label="Alergias/Medicamentos"    value={patient.allergies_medications || '—'} />
          <InfoItem label="Intolerancias"            value={patient.food_intolerances || '—'} />
        </div>
      </div>

      {/* Antecedentes familiares */}
      <div className="card">
        <p className="text-xs font-semibold text-[#64748B] mb-3 flex items-center gap-2">
          <Activity size={14} /> Antecedentes familiares
        </p>
        <div className="space-y-2">
          <FamilyItem label="Diabetes Tipo 2"  active={fam.diabetes_type2} />
          <FamilyItem label="SOP / PCOS"       active={fam.pcos} />
          <FamilyItem label="Hipotiroidismo"   active={fam.hypothyroidism} />
        </div>
        {patient.notes && (
          <div className="mt-4 pt-3 border-t border-[rgba(255,255,255,0.04)]">
            <p className="text-xs text-[#4A5568] mb-1">Notas</p>
            <p className="text-sm text-[#94A3B8]">{patient.notes}</p>
          </div>
        )}
      </div>

      {/* Fechas */}
      <div className="card col-span-2">
        <p className="text-xs font-semibold text-[#64748B] mb-3 flex items-center gap-2">
          <Calendar size={14} /> Fechas
        </p>
        <div className="flex gap-6">
          <InfoItem label="Registro"            value={formatDate(patient.created_at)} />
          <InfoItem label="Última actualización" value={formatDate(patient.updated_at)} />
          <InfoItem label="Doctor asignado"     value={patient.assigned_doctor || '—'} />
        </div>
      </div>
    </div>
  )
}
