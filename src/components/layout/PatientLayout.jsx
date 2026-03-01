import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Scale, Pill, MessageCircle, LogOut } from 'lucide-react'
import { useAuth } from '../../lib/AuthContext'

export default function PatientLayout({ children, title, subtitle, rightAction }) {
  const { profile, logout } = useAuth()

  return (
    <div className="app-shell pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            {subtitle && <p className="text-[11px] text-gray-400 font-medium tracking-wide uppercase">{subtitle}</p>}
            <h1 className="text-lg font-bold text-gray-900 truncate" style={{ fontFamily: 'var(--font-display)' }}>
              {title || `Hola, ${profile?.full_name?.split(' ')[0] || 'Paciente'}`}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {rightAction}
            <button onClick={logout} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition" title="Cerrar sesión">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="px-4 py-4 page-enter">
        {children}
      </main>

      {/* Bottom nav */}
      <nav className="bottom-nav">
        <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'active' : ''}>
          <LayoutDashboard size={20} />
          <span>Inicio</span>
        </NavLink>
        <NavLink to="/weight" className={({ isActive }) => isActive ? 'active' : ''}>
          <Scale size={20} />
          <span>Peso</span>
        </NavLink>
        <NavLink to="/meds" className={({ isActive }) => isActive ? 'active' : ''}>
          <Pill size={20} />
          <span>Medicación</span>
        </NavLink>
        <NavLink to="/chat" className={({ isActive }) => isActive ? 'active' : ''}>
          <MessageCircle size={20} />
          <span>Chat</span>
        </NavLink>
      </nav>
    </div>
  )
}
