import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'
import { KeyRound, ArrowRight, Stethoscope } from 'lucide-react'

export default function PatientLogin() {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { loginPatient } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!code.trim()) return setError('Introduce tu código de acceso')
    setError('')
    setLoading(true)
    try {
      await loginPatient(code)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Código no válido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-shell flex flex-col items-center justify-center min-h-screen px-6"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #1E2530 0%, #1A1D23 40%, #13151A 100%)' }}>
      <div className="w-full max-w-sm">
        {/* Logo — Metallic embossed */}
        <div className="text-center mb-10">
          <div className="mx-auto mb-5 flex items-center justify-center"
            style={{
              width: 76, height: 76, borderRadius: 22,
              background: 'linear-gradient(145deg, #2DD4BF, #0D9488)',
              boxShadow: '0 8px 32px rgba(45,212,191,0.25), 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.15)',
            }}>
            <Stethoscope size={32} style={{ color: '#042F2E', filter: 'drop-shadow(0 1px 1px rgba(255,255,255,0.2))' }} />
          </div>
          <h1 className="text-[28px] font-bold" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.03em', color: '#F1F5F9' }}>
            NutriMed Connect
          </h1>
          <p className="text-[13px] mt-1.5 font-medium tracking-wide" style={{ color: '#4A5568' }}>Tu seguimiento nutricional</p>
        </div>

        {/* Form — Neumorphic card */}
        <div className="rounded-[24px] p-6 mb-6"
          style={{
            background: 'linear-gradient(145deg, #262B34, #1F232B)',
            border: '1px solid rgba(255,255,255,0.04)',
            boxShadow: '8px 8px 24px rgba(0,0,0,0.4), -6px -6px 16px rgba(255,255,255,0.02), inset 1px 1px 0 rgba(255,255,255,0.06)',
          }}>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="input-label">
                <KeyRound size={11} className="inline mr-1" style={{ color: '#2DD4BF' }} />
                Código de acceso
              </label>
              <input
                type="text"
                className="input text-center text-lg tracking-[0.3em] uppercase font-mono"
                placeholder="XXXXXX"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={8}
                autoComplete="off"
                autoFocus
              />
            </div>

            {error && (
              <div className="rounded-xl px-4 py-3 text-sm"
                style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)', color: '#FCA5A5' }}>
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-full" disabled={loading || !code.trim()}>
              {loading ? <div className="loader !w-5 !h-5 !border-teal-900 !border-t-transparent" /> : <>Acceder <ArrowRight size={16} /></>}
            </button>
          </form>
        </div>

        <p className="text-center text-xs" style={{ color: '#4A5568' }}>
          Tu código lo genera tu profesional en consulta.
          <br />Caduca a los 28 días.
        </p>

        <div className="text-center mt-6">
          <Link to="/pro/login" className="text-xs font-medium hover:underline" style={{ color: '#2DD4BF' }}>
            Acceso profesional →
          </Link>
        </div>
      </div>
    </div>
  )
}
