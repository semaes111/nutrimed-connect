import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

// Safe localStorage wrapper — Safari private mode and restrictive iOS configs can throw
function safeGetItem(key) {
  try { return localStorage.getItem(key) } catch { return null }
}
function safeSetItem(key, value) {
  try { localStorage.setItem(key, value) } catch { /* ignore */ }
}
function safeRemoveItem(key) {
  try { localStorage.removeItem(key) } catch { /* ignore */ }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [role, setRole] = useState(null) // 'professional' | 'patient' | null
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Resolve role + profile from session
  const resolveUser = useCallback(async (sess) => {
    try {
      // Check patient session in localStorage FIRST (patients don't use Supabase Auth)
      const patientSession = safeGetItem('nm_patient_session')
      if (patientSession) {
        try {
          const ps = JSON.parse(patientSession)
          if (ps.patient_id && new Date(ps.expires_at) > new Date()) {
            const { data: patient } = await supabase
              .from('nm_patients')
              .select('*')
              .eq('id', ps.patient_id)
              .maybeSingle()
            if (patient && !patient.is_blocked) {
              setRole('patient')
              setProfile(patient)
              return
            }
          }
          safeRemoveItem('nm_patient_session')
        } catch { /* ignore parse error */ }
      }

      // No patient session — check Supabase Auth for professionals
      if (!sess?.user) {
        setRole(null)
        setProfile(null)
        return
      }
      const userId = sess.user.id

      const { data: pro } = await supabase
        .from('nm_professionals')
        .select('*')
        .eq('auth_user_id', userId)
        .eq('is_active', true)
        .maybeSingle()

      if (pro) {
        setRole('professional')
        setProfile(pro)
        return
      }

      setRole(null)
      setProfile(null)
    } catch (err) {
      console.error('[AuthContext] resolveUser error:', err)
      setRole(null)
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      resolveUser(s)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (!s) { setRole(null); setProfile(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [resolveUser])

  // Professional login
  const loginPro = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    await resolveUser(data.session)
    return data
  }

  // Patient login with access code
  const loginPatient = async (code) => {
    const trimmed = code.trim().toUpperCase()
    const { data: ac, error } = await supabase
      .from('nm_access_codes')
      .select('*, patient:nm_patients(*)')
      .eq('access_code', trimmed)
      .eq('is_blocked', false)
      .maybeSingle()

    if (error || !ac) throw new Error('Código no válido')
    if (new Date(ac.code_expiry) < new Date()) throw new Error('Código expirado. Contacte con su consulta.')
    if (ac.patient?.is_blocked) throw new Error('Acceso bloqueado. Contacte con su consulta.')

    // Store patient session
    const patientSession = {
      patient_id: ac.patient_id,
      code: trimmed,
      expires_at: ac.code_expiry,
      logged_at: new Date().toISOString()
    }
    safeSetItem('nm_patient_session', JSON.stringify(patientSession))
    setRole('patient')
    setProfile(ac.patient)
    return ac.patient
  }

  const logout = async () => {
    safeRemoveItem('nm_patient_session')
    await supabase.auth.signOut()
    setSession(null)
    setRole(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ session, role, profile, loading, loginPro, loginPatient, logout, setProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
