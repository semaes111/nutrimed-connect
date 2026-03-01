import { NavLink, useNavigate } from 'react-router-dom'
import { Users, UserPlus, LogOut, Stethoscope } from 'lucide-react'
import { useAuth } from '../../lib/AuthContext'

export default function ProLayout({ children, title }) {
  const { profile, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/pro/login')
  }

  return (
    <div className="app-shell--pro min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-60 bg-white border-r border-gray-200 flex flex-col fixed h-full z-30">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--color-brand)] flex items-center justify-center">
              <Stethoscope size={18} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>NutriMed</p>
              <p className="text-[10px] text-gray-400">Panel profesional</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          <NavLink to="/pro" end className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${isActive ? 'bg-teal-50 text-[var(--color-brand)]' : 'text-gray-500 hover:bg-gray-50'}`
          }>
            <Users size={18} /> Pacientes
          </NavLink>
          <NavLink to="/pro/patient/new" className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${isActive ? 'bg-teal-50 text-[var(--color-brand)]' : 'text-gray-500 hover:bg-gray-50'}`
          }>
            <UserPlus size={18} /> Nuevo paciente
          </NavLink>
        </nav>

        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-xs font-bold text-[var(--color-brand)]">
              {profile?.full_name?.charAt(0) || 'P'}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">{profile?.full_name || 'Profesional'}</p>
              <p className="text-[10px] text-gray-400 truncate">{profile?.specialty || 'Nutrición'}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="btn btn-secondary btn-sm btn-full">
            <LogOut size={14} /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-60 flex-1 p-6">
        {title && <h1 className="text-2xl font-bold text-gray-900 mb-6" style={{ fontFamily: 'var(--font-display)' }}>{title}</h1>}
        <div className="page-enter">{children}</div>
      </main>
    </div>
  )
}
