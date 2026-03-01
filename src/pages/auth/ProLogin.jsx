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
    setError('')
    setLoading(true)
    try {
      await loginPro(email, password)
      navigate('/pro')
    } catch (err) {
      setError(err.message?.includes('Invalid') ? 'Credenciales incorrectas' : err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen px-6" style={{ background: 'linear-gradient(160deg, #F8FAFC 0%, #F0FDFA 100%)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="w-14 h-14 rounded-2xl bg-gray-900 flex items-center justify-center mx-auto mb-4">
            <Stethoscope size={24} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>Panel profesional</h1>
          <p className="text-sm text-gray-400 mt-1">NutriMed Connect</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="input-label"><Mail size={12} className="inline mr-1" />Email</label>
            <input type="email" className="input" placeholder="doctor@consulta.com" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div>
            <label className="input-label"><Lock size={12} className="inline mr-1" />Contraseña</label>
            <input type="password" className="input" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
          </div>

          {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>}

          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? <div className="loader !w-5 !h-5 !border-white !border-t-transparent" /> : <>Entrar <ArrowRight size={16} /></>}
          </button>
        </form>

        <div className="text-center mt-6">
          <Link to="/login" className="text-xs text-gray-400 hover:text-[var(--color-brand)]">← Acceso paciente</Link>
        </div>
      </div>
    </div>
  )
}
