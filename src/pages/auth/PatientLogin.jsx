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
    <div className="app-shell flex flex-col items-center justify-center min-h-screen px-6" style={{ background: 'linear-gradient(160deg, #F0FDFA 0%, #FFFFFF 50%, #F8FAFC 100%)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-[var(--color-brand)] flex items-center justify-center mx-auto mb-4 shadow-lg shadow-teal-200/50">
            <Stethoscope size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>NutriMed Connect</h1>
          <p className="text-sm text-gray-400 mt-1">Tu seguimiento nutricional</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="input-label">
              <KeyRound size={12} className="inline mr-1" />
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
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-full" disabled={loading || !code.trim()}>
            {loading ? <div className="loader !w-5 !h-5 !border-white !border-t-transparent" /> : <>Acceder <ArrowRight size={16} /></>}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-8">
          Tu código lo genera tu profesional en consulta.
          <br />Caduca a los 28 días.
        </p>

        <div className="text-center mt-6">
          <Link to="/pro/login" className="text-xs text-[var(--color-brand)] hover:underline">
            Acceso profesional →
          </Link>
        </div>
      </div>
    </div>
  )
}
