import { Routes, Route, Navigate } from 'react-router-dom'
import { Component } from 'react'
import { useAuth } from './lib/AuthContext'
import { ThemeProvider } from './lib/ThemeContext'

// Auth pages
import PatientLogin from './pages/auth/PatientLogin'
import ProLogin from './pages/auth/ProLogin'

// Patient pages
import PatientDashboard from './pages/patient/PatientDashboard'
import WeightTracker from './pages/patient/WeightTracker'
import MedsView from './pages/patient/MedsView'
import PatientChat from './pages/patient/PatientChat'

// Pro pages
import ProDashboard from './pages/pro/ProDashboard'
import ProPatientDetail from './pages/pro/ProPatientDetail'
import ProPatientForm from './pages/pro/ProPatientForm'

/** Error Boundary — catches JS errors in child components to prevent full app crash (iOS Safari Error 5) */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px 20px', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
          <p style={{ fontSize: '14px', color: '#EF4444', marginBottom: '12px' }}>
            Se ha producido un error al cargar esta página.
          </p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload() }}
            style={{ background: '#0D9488', color: '#fff', border: 'none', borderRadius: '10px', padding: '10px 24px', fontSize: '14px', cursor: 'pointer' }}
          >
            Recargar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function RequirePatient({ children }) {
  const { role, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="loader" /></div>
  if (role !== 'patient') return <Navigate to="/login" replace />
  return children
}

function RequirePro({ children }) {
  const { role, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="loader" /></div>
  if (role !== 'professional') return <Navigate to="/pro/login" replace />
  return children
}

export default function App() {
  const { role, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--color-surface)]">
        <div className="text-center">
          <div className="loader mx-auto mb-4" />
          <p className="text-sm text-gray-400 font-medium">Cargando NutriMed...</p>
        </div>
      </div>
    )
  }

  return (
    <ThemeProvider>
    <ErrorBoundary>
      <Routes>
        {/* Auth */}
        <Route path="/login" element={role === 'patient' ? <Navigate to="/dashboard" /> : <PatientLogin />} />
        <Route path="/pro/login" element={role === 'professional' ? <Navigate to="/pro" /> : <ProLogin />} />

        {/* Patient */}
        <Route path="/dashboard" element={<RequirePatient><PatientDashboard /></RequirePatient>} />
        <Route path="/weight" element={<RequirePatient><WeightTracker /></RequirePatient>} />
        <Route path="/meds" element={<RequirePatient><MedsView /></RequirePatient>} />
        <Route path="/chat" element={<RequirePatient><PatientChat /></RequirePatient>} />

        {/* Professional */}
        <Route path="/pro" element={<RequirePro><ProDashboard /></RequirePro>} />
        <Route path="/pro/patient/:id" element={<RequirePro><ProPatientDetail /></RequirePro>} />
        <Route path="/pro/patient/new" element={<RequirePro><ProPatientForm /></RequirePro>} />
        <Route path="/pro/patient/:id/edit" element={<RequirePro><ProPatientForm /></RequirePro>} />

        {/* Default */}
        <Route path="/" element={<Navigate to={role === 'professional' ? '/pro' : role === 'patient' ? '/dashboard' : '/login'} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
    </ThemeProvider>
  )
}
