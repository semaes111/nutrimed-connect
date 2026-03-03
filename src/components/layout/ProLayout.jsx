import { NavLink, useNavigate } from 'react-router-dom'
import { Users, UserPlus, LogOut, Stethoscope } from 'lucide-react'
import { useAuth } from '../../lib/AuthContext'

export default function ProLayout({ children, title }) {
  const { profile, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => { await logout(); navigate('/pro/login') }

  return (
    <div className="app-shell--pro min-h-screen flex">
      {/* Sidebar — Metallic dark panel */}
      <aside className="w-60 flex flex-col fixed h-full z-30"
        style={{
          background: 'linear-gradient(180deg, #1E2128 0%, #1A1D23 100%)',
          borderRight: '1px solid rgba(255,255,255,0.04)',
          boxShadow: '4px 0 24px rgba(0,0,0,0.3)',
        }}>
        <div className="p-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #2DD4BF, #0D9488)', boxShadow: '0 4px 12px rgba(45,212,191,0.25), inset 0 1px 0 rgba(255,255,255,0.2)' }}>
              <Stethoscope size={18} style={{ color: '#042F2E' }} />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: '#F1F5F9' }}>NutriMed</p>
              <p className="text-[10px]" style={{ color: '#4A5568' }}>Panel profesional</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          <NavLink to="/pro" end className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200`
          } style={({ isActive }) => isActive ? {
            background: 'rgba(45,212,191,0.08)', color: '#2DD4BF',
            boxShadow: 'inset 0 1px 0 rgba(45,212,191,0.1), 0 0 12px rgba(45,212,191,0.04)',
          } : { color: '#64748B' }}>
            <Users size={18} /> Pacientes
          </NavLink>
          <NavLink to="/pro/patient/new" className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200`
          } style={({ isActive }) => isActive ? {
            background: 'rgba(45,212,191,0.08)', color: '#2DD4BF',
          } : { color: '#64748B' }}>
            <UserPlus size={18} /> Nuevo paciente
          </NavLink>
        </nav>

        <div className="p-4" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: 'rgba(45,212,191,0.1)', color: '#2DD4BF', boxShadow: 'inset 1px 1px 2px rgba(0,0,0,0.2)' }}>
              {profile?.full_name?.charAt(0) || 'P'}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: '#E2E8F0' }}>{profile?.full_name || 'Profesional'}</p>
              <p className="text-[10px] truncate" style={{ color: '#4A5568' }}>{profile?.specialty || 'Nutrición'}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="btn btn-secondary btn-sm btn-full">
            <LogOut size={14} /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="ml-60 flex-1 p-6">
        {title && <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--font-display)', color: '#F1F5F9' }}>{title}</h1>}
        <div className="page-enter">{children}</div>
      </main>
    </div>
  )
}
