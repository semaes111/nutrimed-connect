import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'
import { Mail, Lock, ArrowRight, Stethoscope } from 'lucide-react'

export default function ProLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { loginPro } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email || !password) return setError('Completa todos los campos')
    setError(''); setLoading(true)
    try { await loginPro(email, password); navigate('/pro') }
    catch (err) { setError(err.message?.includes('Invalid') ? 'Credenciales incorrectas' : err.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="flex items-center justify-center min-h-screen px-6"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #1E2530 0%, #1A1D23 40%, #13151A 100%)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'linear-gradient(145deg, #2A3040, #1E2128)', boxShadow: '6px 6px 16px rgba(0,0,0,0.4), -4px -4px 12px rgba(255,255,255,0.03), inset 1px 1px 0 rgba(255,255,255,0.06)' }}>
            <Stethoscope size={24} style={{ color: '#2DD4BF' }} />
          </div>
          <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: '#F1F5F9' }}>Panel profesional</h1>
          <p className="text-sm mt-1" style={{ color: '#4A5568' }}>NutriMed Connect</p>
        </div>

        <div className="rounded-[24px] p-6"
          style={{
            background: 'linear-gradient(145deg, #262B34, #1F232B)',
            border: '1px solid rgba(255,255,255,0.04)',
            boxShadow: '8px 8px 24px rgba(0,0,0,0.4), -6px -6px 16px rgba(255,255,255,0.02), inset 1px 1px 0 rgba(255,255,255,0.06)',
          }}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="input-label"><Mail size={11} className="inline mr-1" style={{ color: '#2DD4BF' }} />Email</label>
              <input type="email" className="input" placeholder="doctor@consulta.com" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div>
              <label className="input-label"><Lock size={11} className="inline mr-1" style={{ color: '#2DD4BF' }} />Contraseña</label>
              <input type="password" className="input" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            {error && <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)', color: '#FCA5A5' }}>{error}</div>}
            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? <div className="loader !w-5 !h-5 !border-teal-900 !border-t-transparent" /> : <>Entrar <ArrowRight size={16} /></>}
            </button>
          </form>
        </div>

        <div className="text-center mt-6">
          <Link to="/login" className="text-xs hover:underline" style={{ color: '#4A5568' }}>← Acceso paciente</Link>
        </div>
      </div>
    </div>
  )
}
