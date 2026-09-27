import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { authenticatePatient, restorePatientSession } from './patientAccess'

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
  const [patientCode, setPatientCode] = useState(null)

  // Resolve role + profile from session
  const resolveUser = useCallback(async (sess) => {
    try {
      const saved = safeGetItem('nm_patient_session')
      if (saved) {
        try {
          if (sess?.user) {
            const { error } = await supabase.auth.signOut({ scope: 'local' })
            if (error) throw error
            setSession(null)
          }
          const restored = await restorePatientSession(supabase, saved)
          if (restored) {
            setRole('patient')
            setProfile(restored.patient)
            setPatientCode(restored.code)
            return
          }
        } catch { /* Fail closed; a failed patient session must not reveal a professional session. */ }
        safeRemoveItem('nm_patient_session')
        setPatientCode(null)
        setRole(null)
        setProfile(null)
        return
      }
      setPatientCode(null)

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
    } catch {
      console.error('[AuthContext] No se pudo comprobar la sesión')
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
      if (_event === 'SIGNED_OUT' && !safeGetItem('nm_patient_session')) {
        setRole(null); setProfile(null); setPatientCode(null); setLoading(false)
      }
    })
    return () => subscription.unsubscribe()
  }, [resolveUser])

  // Professional login
  const loginPro = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    safeRemoveItem('nm_patient_session')
    setPatientCode(null)
    await resolveUser(data.session)
    return data
  }

  // Patient login with access code
  const loginPatient = async (code) => {
    const { patient, code: normalized } = await authenticatePatient(supabase, code)
    const { data: { session: professionalSession } } = await supabase.auth.getSession()
    if (professionalSession) {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw new Error('No se pudo cambiar de sesión. Inténtalo de nuevo.')
      setSession(null)
    }
    safeSetItem('nm_patient_session', JSON.stringify({
      patient_id: patient.id,
      code: normalized,
      logged_at: new Date().toISOString(),
    }))
    setPatientCode(normalized)
    setRole('patient')
    setProfile(patient)
    return patient
  }

  const logout = async () => {
    safeRemoveItem('nm_patient_session')
    setPatientCode(null)
    await supabase.auth.signOut()
    setSession(null)
    setRole(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ session, role, profile, patientCode, loading, loginPro, loginPatient, logout, setProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
