import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Scale, Pill, MessageCircle, LogOut } from 'lucide-react'
import { useAuth } from '../../lib/AuthContext'

export default function PatientLayout({ children, title, subtitle, rightAction }) {
  const { profile, logout } = useAuth()

  return (
    <div className="app-shell pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-teal-900/5 px-4 py-3.5" style={{ backdropFilter: 'blur(24px) saturate(1.6)' }}>
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            {subtitle && <p className="text-[10px] text-teal-600/60 font-semibold tracking-[0.12em] uppercase mb-0.5">{subtitle}</p>}
            <h1 className="text-[19px] font-bold text-gray-900 truncate" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
              {title || `Hola, ${profile?.full_name?.split(' ')[0] || 'Paciente'}`}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {rightAction}
            <button onClick={logout} className="p-2.5 rounded-xl hover:bg-teal-50 text-gray-400 hover:text-teal-600 transition-all duration-200" title="Cerrar sesión">
              <LogOut size={17} />
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
