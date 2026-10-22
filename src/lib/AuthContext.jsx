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

// Acceso del paciente por código (2026-10-22): las lecturas del paciente pasan por las RPC
// nm_app_*(p_codigo) (migración 020). nm_app_login valida en servidor que el código existe,
// no está bloqueado ni caducado, y devuelve SOLO la ficha de su dueño (0 filas si no).
// Sustituye a la lectura directa de nm_access_codes / nm_patients con la clave anónima,
// que exponía todas las fichas y códigos a cualquiera.
async function fetchPatientByCode(code) {
  const { data, error } = await supabase
    .rpc('nm_app_login', { p_codigo: code })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data || null
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [role, setRole] = useState(null) // 'professional' | 'patient' | null
  const [profile, setProfile] = useState(null)
  const [patientCode, setPatientCode] = useState(null) // código de acceso de la sesión paciente
  const [loading, setLoading] = useState(true)

  // Resolve role + profile from session
  const resolveUser = useCallback(async (sess) => {
    try {
      // Check patient session in localStorage FIRST (patients don't use Supabase Auth)
      const patientSession = safeGetItem('nm_patient_session')
      if (patientSession) {
        try {
          const ps = JSON.parse(patientSession)
          // expires_at puede ser null (lo decide el servidor); si existe, se respeta como defensa extra
          const notExpired = !ps.expires_at || new Date(ps.expires_at) > new Date()
          if (ps.patient_id && ps.code && notExpired) {
            const patient = await fetchPatientByCode(ps.code)
            if (patient && patient.id === ps.patient_id && !patient.is_blocked) {
              setPatientCode(ps.code)
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

  // Patient login with access code (validación íntegra en servidor vía nm_app_login)
  const loginPatient = async (code) => {
    const trimmed = code.trim().toUpperCase()
    let patient
    try {
      patient = await fetchPatientByCode(trimmed)
    } catch (err) {
      console.error('[AuthContext] loginPatient error:', err)
      throw new Error('No se pudo validar el código. Inténtalo de nuevo.', { cause: err })
    }
    // 0 filas = inexistente, bloqueado o caducado: un único mensaje (sin oráculo de estado)
    if (!patient || patient.is_blocked) throw new Error('Código no válido o caducado. Contacte con su consulta.')

    // Store patient session (misma forma que antes: patient_id, code, expires_at, logged_at)
    const patientSession = {
      patient_id: patient.id,
      code: trimmed,
      expires_at: patient.code_expiry || null,
      logged_at: new Date().toISOString()
    }
    safeSetItem('nm_patient_session', JSON.stringify(patientSession))
    setPatientCode(trimmed)
    setRole('patient')
    setProfile(patient)
    return patient
  }

  const logout = async () => {
    safeRemoveItem('nm_patient_session')
    await supabase.auth.signOut()
    setSession(null)
    setRole(null)
    setProfile(null)
    setPatientCode(null)
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
