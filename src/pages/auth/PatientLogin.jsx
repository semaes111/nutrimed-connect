import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'
import { usePageTheme } from '../../lib/usePageTheme'
import { KeyRound, ArrowRight, Stethoscope } from 'lucide-react'

export default function PatientLogin() {
  const [code, setCode]     = useState('')
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const { loginPatient }    = useAuth()
  const navigate            = useNavigate()
  const tc                  = usePageTheme()

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

  const pageBg = tc.isDark
    ? 'radial-gradient(ellipse at 50% 0%, #1E2530 0%, #1A1D23 40%, #13151A 100%)'
    : 'radial-gradient(ellipse at 50% 0%, #D8E4F0 0%, #E2E8F2 40%, #EBF0F8 100%)'

  const errorBg     = tc.isDark ? 'rgba(248,113,113,0.08)' : 'rgba(220,38,38,0.07)'
  const errorBorder = tc.isDark ? 'rgba(248,113,113,0.15)' : 'rgba(220,38,38,0.20)'

  return (
    <div className="app-shell flex flex-col items-center justify-center min-h-screen px-6"
      style={{ background: pageBg }}>
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-10">
          <div className="mx-auto mb-5 flex items-center justify-center"
            style={{
              width: 76, height: 76, borderRadius: 22,
              background: 'linear-gradient(145deg, #2DD4BF, #0D9488)',
              boxShadow: '0 8px 32px rgba(45,212,191,0.25), 0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.3)',
            }}>
            <Stethoscope size={32} style={{ color: '#042F2E', filter: 'drop-shadow(0 1px 1px rgba(255,255,255,0.2))' }} />
          </div>
          <h1 className="text-[28px] font-bold"
            style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.03em', color: tc.textPrimary }}>
            NutriMed Connect
          </h1>
          <p className="text-[13px] mt-1.5 font-semibold tracking-wide" style={{ color: tc.textMuted }}>
            Tu seguimiento nutricional
          </p>
        </div>

        {/* Formulario */}
        <div className="rounded-[24px] p-6 mb-6"
          style={{ background: tc.cardBg, border: tc.cardBorder, boxShadow: tc.cardShadow }}>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="input-label">
                <KeyRound size={11} className="inline mr-1" style={{ color: tc.textAccent }} />
                Código de acceso
              </label>
              <input
                type="text"
                className="input text-center text-lg tracking-[0.3em] uppercase font-mono"
                placeholder="XXXXXX"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                maxLength={8}
                autoComplete="off"
                autoFocus
              />
            </div>

            {error && (
              <div className="rounded-xl px-4 py-3 text-sm font-semibold"
                style={{ background: errorBg, border: `1px solid ${errorBorder}`, color: tc.textDanger }}>
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-full" disabled={loading || !code.trim()}>
              {loading
                ? <div className="loader !w-5 !h-5 !border-teal-900 !border-t-transparent" />
                : <>Acceder <ArrowRight size={16} /></>}
            </button>
          </form>
        </div>

        <p className="text-center text-xs font-medium" style={{ color: tc.textMuted }}>
          Tu código lo genera tu profesional en consulta.
          <br />Caduca a los 28 días.
        </p>

        <div className="text-center mt-6">
          <Link to="/pro/login" className="text-xs font-semibold hover:underline" style={{ color: tc.textAccent }}>
            Acceso profesional →
          </Link>
        </div>
      </div>
    </div>
  )
}
