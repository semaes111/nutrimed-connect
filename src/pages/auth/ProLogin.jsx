import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'
import { usePageTheme } from '../../lib/usePageTheme'
import { Mail, Lock, ArrowRight, ShieldCheck } from 'lucide-react'

export default function ProLogin() {
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const { loginPro }          = useAuth()
  const navigate              = useNavigate()
  const tc                    = usePageTheme()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await loginPro(email, password)
      navigate('/pro/dashboard')
    } catch (err) {
      setError(err.message || 'Credenciales incorrectas')
    } finally {
      setLoading(false)
    }
  }

  const pageBg = tc.isDark
    ? 'radial-gradient(ellipse at 50% 0%, #1A2030 0%, #1A1D23 40%, #13151A 100%)'
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
              background: 'linear-gradient(145deg, #6D28D9, #4C1D95)',
              boxShadow: '0 8px 32px rgba(109,40,217,0.25), 0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.2)',
            }}>
            <ShieldCheck size={32} style={{ color: '#EDE9FE', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.3))' }} />
          </div>
          <h1 className="text-[28px] font-bold"
            style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.03em', color: tc.textPrimary }}>
            Panel Profesional
          </h1>
          <p className="text-[13px] mt-1.5 font-semibold tracking-wide" style={{ color: tc.textMuted }}>
            NutriMed Connect
          </p>
        </div>

        {/* Formulario */}
        <div className="rounded-[24px] p-6 mb-6"
          style={{ background: tc.cardBg, border: tc.cardBorder, boxShadow: tc.cardShadow }}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="input-label">
                <Mail size={11} className="inline mr-1" style={{ color: tc.accentPurple }} />
                Email profesional
              </label>
              <input type="email" className="input" placeholder="tu@email.com"
                value={email} onChange={e => setEmail(e.target.value)} autoFocus required />
            </div>
            <div>
              <label className="input-label">
                <Lock size={11} className="inline mr-1" style={{ color: tc.accentPurple }} />
                Contraseña
              </label>
              <input type="password" className="input" placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)} required />
            </div>

            {error && (
              <div className="rounded-xl px-4 py-3 text-sm font-semibold"
                style={{ background: errorBg, border: `1px solid ${errorBorder}`, color: tc.textDanger }}>
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-secondary btn-full !mt-2" disabled={loading || !email || !password}
              style={{ background: 'linear-gradient(135deg, #6D28D9, #4C1D95)', color: '#EDE9FE', border: 'none' }}>
              {loading
                ? <div className="loader !w-5 !h-5 !border-purple-200 !border-t-transparent" />
                : <>Entrar al panel <ArrowRight size={16} /></>}
            </button>
          </form>
        </div>

        <div className="text-center">
          <Link to="/" className="text-xs font-semibold hover:underline" style={{ color: tc.textMuted }}>
            ← Acceso pacientes
          </Link>
        </div>
      </div>
    </div>
  )
}
