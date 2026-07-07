/**
 * src/components/pro/tabs/AccessTab.jsx
 *
 * Responsabilidad: gestión del código de acceso del paciente (generar, copiar, bloquear).
 * Incluye manejo de errores explícito en todas las operaciones async.
 */

import { useState } from 'react'
import { supabase } from '../../../lib/supabase.js'
import { formatDate, getDaysRemaining } from '../../../lib/dietConfig'
import { Key, Copy, Check, Lock, Unlock } from 'lucide-react'

/** Genera un código de acceso aleatorio de 8 caracteres (sin caracteres ambiguos). */
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

/**
 * @param {{ patient: object, onUpdate: Function }} props
 */
export default function AccessTab({ patient, onUpdate }) {
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error,  setError]  = useState(null)

  async function handleGenerate() {
    setSaving(true)
    setError(null)
    try {
      const code   = generateCode()
      const expiry = new Date()
      expiry.setDate(expiry.getDate() + 28)

      const { error: patErr } = await supabase.from('nm_patients').update({
        access_code: code,
        code_expiry: expiry.toISOString(),
        is_blocked:  false,
      }).eq('id', patient.id)
      if (patErr) throw patErr

      const { error: codeErr } = await supabase.from('nm_access_codes').upsert({
        patient_id:  patient.id,
        access_code: code,
        code_expiry: expiry.toISOString(),
        is_blocked:  false,
      }, { onConflict: 'patient_id' })
      if (codeErr) throw codeErr

      onUpdate()
    } catch (err) {
      console.error('[AccessTab] handleGenerate error:', err)
      setError('Error al generar el código de acceso.')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleBlock() {
    setSaving(true)
    setError(null)
    try {
      const newBlocked = !patient.is_blocked

      const { error: patErr } = await supabase
        .from('nm_patients').update({ is_blocked: newBlocked }).eq('id', patient.id)
      if (patErr) throw patErr

      const { error: codeErr } = await supabase
        .from('nm_access_codes').update({ is_blocked: newBlocked }).eq('patient_id', patient.id)
      if (codeErr) throw codeErr

      onUpdate()
    } catch (err) {
      console.error('[AccessTab] handleToggleBlock error:', err)
      setError('Error al cambiar el estado de bloqueo.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCopy() {
    if (!patient.access_code) return
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(patient.access_code)
      } else {
        // Fallback para contextos sin HTTPS o Safari antiguo
        const ta = document.createElement('textarea')
        ta.value = patient.access_code
        ta.style.cssText = 'position:fixed;left:-9999px'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Último recurso: seleccionar el texto para que el usuario haga Ctrl+C
      const el = document.querySelector('[data-code]')
      if (el) {
        const range = document.createRange()
        range.selectNodeContents(el)
        window.getSelection()?.removeAllRanges()
        window.getSelection()?.addRange(range)
      }
    }
  }

  const daysLeft = getDaysRemaining(patient.code_expiry)

  return (
    <div className="max-w-lg">
      {error && (
        <div className="mb-3 px-4 py-2.5 rounded-xl text-xs font-medium"
          style={{ background: 'rgba(248,113,113,0.08)', color: '#FB7185', border: '1px solid rgba(248,113,113,0.2)' }}>
          {error}
        </div>
      )}

      <div className="card card--elevated">
        <p className="text-sm font-semibold text-[#E2E8F0] mb-4 flex items-center gap-2">
          <Key size={16} /> Código de acceso del paciente
        </p>

        {patient.access_code ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div data-code
                className="flex-1 bg-[#1F232B] rounded-xl px-4 py-3 font-mono text-2xl tracking-[0.3em] text-center font-bold text-[#E2E8F0] select-all">
                {patient.access_code}
              </div>
              <button onClick={handleCopy} className="btn btn-secondary !p-3 !rounded-xl" title="Copiar">
                {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
              </button>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-[#4A5568]">
                Expira: <strong className="text-[#94A3B8]">{formatDate(patient.code_expiry)}</strong>
              </span>
              {daysLeft !== null && (
                <span className={`badge ${
                  daysLeft <= 0
                    ? 'bg-[rgba(248,113,113,0.06)] text-[#FB7185]'
                    : daysLeft <= 7
                      ? 'bg-[rgba(251,191,36,0.04)] text-[#E9A820]'
                      : 'bg-[rgba(52,211,153,0.06)] text-[#34D399]'
                }`}>
                  {daysLeft <= 0 ? 'Expirado' : `${daysLeft} días`}
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={handleGenerate} disabled={saving} className="btn btn-primary btn-sm flex-1">
                <Key size={14} /> {saving ? '...' : 'Regenerar código (28d)'}
              </button>
              <button
                onClick={handleToggleBlock} disabled={saving}
                className={`btn btn-sm flex-1 ${
                  patient.is_blocked
                    ? 'bg-[rgba(52,211,153,0.06)] text-[#34D399] hover:bg-green-100'
                    : 'bg-[rgba(248,113,113,0.06)] text-[#FB7185] hover:bg-red-100'
                }`}
              >
                {patient.is_blocked
                  ? <><Unlock size={14} /> Desbloquear</>
                  : <><Lock size={14} /> Bloquear</>}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <Key size={32} className="mx-auto text-[#2A2F38] mb-3" />
            <p className="text-sm text-[#4A5568] mb-4">Sin código de acceso generado</p>
            <button onClick={handleGenerate} disabled={saving} className="btn btn-primary btn-sm">
              <Key size={14} /> {saving ? 'Generando...' : 'Generar código (28 días)'}
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 p-4 rounded-xl bg-[rgba(96,165,250,0.06)] border border-blue-100">
        <p className="text-xs text-blue-700">
          El paciente introduce este código en la pantalla de acceso de la app para ver su dieta,
          peso y medicación. El código caduca automáticamente a los 28 días.
        </p>
      </div>
    </div>
  )
}
