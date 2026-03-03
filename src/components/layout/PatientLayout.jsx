import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Scale, Pill, MessageCircle, LogOut } from 'lucide-react'
import { useAuth } from '../../lib/AuthContext'

export default function PatientLayout({ children, title, subtitle, rightAction }) {
  const { profile, logout } = useAuth()

  return (
    <div className="app-shell pb-20">
      {/* Header — frosted dark glass with metallic border */}
      <header className="sticky top-0 z-40 px-4 py-3.5"
        style={{
          background: 'rgba(26,29,35,0.82)',
          backdropFilter: 'blur(24px) saturate(1.6)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.2), inset 0 -1px 0 rgba(255,255,255,0.03)'
        }}>
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            {subtitle && <p className="text-[10px] font-bold tracking-[0.14em] uppercase mb-0.5" style={{ color: '#2DD4BF' }}>{subtitle}</p>}
            <h1 className="text-[19px] font-bold truncate" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.02em', color: '#F1F5F9' }}>
              {title || `Hola, ${profile?.full_name?.split(' ')[0] || 'Paciente'}`}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {rightAction}
            <button onClick={logout} className="p-2.5 rounded-xl transition-all duration-200" title="Cerrar sesión"
              style={{ color: '#4A5568' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(45,212,191,0.08)'; e.currentTarget.style.color = '#2DD4BF' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#4A5568' }}>
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
