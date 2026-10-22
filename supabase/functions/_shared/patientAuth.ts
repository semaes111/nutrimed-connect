// _shared/patientAuth.ts — Autorización por paciente/profesional para las Edge Functions (2026-10-22)
//
// Problema que resuelve: nm-chat, nm-scanner y nm-shopping (verify_jwt: false) aceptaban
// cualquier patient_id → con la anon key pública se podía obtener el contexto clínico de
// cualquier paciente y consumir cuota de IA sin límite.
//
// Modelo: el paciente envía su access_code en el body; la EF lo resuelve con la RPC
// nm_app_paciente_id (SECURITY DEFINER, EXECUTE solo service_role — migración 020) y exige
// que coincida con patient_id. El profesional envía su JWT de Supabase Auth en Authorization.
//
// Modo de despliegue en dos pasos (compatibilidad con el bundle antiguo que no envía código):
//   NM_REQUIRE_ACCESS_CODE != 'true' (soft):  si llega access_code/JWT se valida (403 si no
//                                             coincide); si NO llega, se permite y se avisa en logs.
//   NM_REQUIRE_ACCESS_CODE == 'true' (strict): sin access_code/JWT → 401.
// Activar strict (secret en el Vault) SOLO después de publicar el frontend que envía el código.

export interface RpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>
}

export type AuthResult =
  | { ok: true; mode: 'code' | 'jwt' | 'legacy' }
  | { ok: false; status: number; error: string }

export function accessCodeRequired(): boolean {
  return (Deno.env.get('NM_REQUIRE_ACCESS_CODE') ?? '').trim().toLowerCase() === 'true'
}

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

/** Devuelve el patient_id dueño del código (null si no existe, bloqueado o caducado). */
export async function resolvePatientIdByCode(db: RpcClient, code: string): Promise<string | null> {
  const { data, error } = await db.rpc('nm_app_paciente_id', { p_codigo: code })
  if (error) {
    console.error('[patientAuth] nm_app_paciente_id error:', error.message)
    return null
  }
  return isUuid(data) ? data : null
}

/** Autoriza una llamada de paciente: access_code debe pertenecer a patient_id. */
export async function authorizePatient(
  db: RpcClient,
  patientId: string,
  accessCode: unknown,
  fnName: string
): Promise<AuthResult> {
  const code = typeof accessCode === 'string' ? accessCode.trim().toUpperCase() : ''
  if (code.length >= 4) {
    const owner = await resolvePatientIdByCode(db, code)
    if (!owner || owner !== patientId) {
      console.warn(`[${fnName}] access_code no válido para patient_id=${patientId}`)
      return { ok: false, status: 403, error: 'Código de acceso no válido para este paciente' }
    }
    return { ok: true, mode: 'code' }
  }
  if (accessCodeRequired()) {
    return { ok: false, status: 401, error: 'access_code requerido' }
  }
  console.warn(`[${fnName}] llamada sin access_code (modo compatibilidad) patient_id=${patientId}`)
  return { ok: true, mode: 'legacy' }
}

/** Extrae el bearer de Authorization si es un JWT de usuario (no la anon/service key). */
export function extractUserJwt(req: Request): string | null {
  const auth = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  if (!m) return null
  const token = m[1].trim()
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    const role = typeof payload.role === 'string' ? payload.role : ''
    if (role === 'anon' || role === 'service_role' || !payload.sub) return null
    return token
  } catch {
    return null
  }
}

export interface ProfessionalAuthDeps {
  /** Verifica el JWT y devuelve el auth user id (sub) o null. */
  getUserId: (jwt: string) => Promise<string | null>
  /** Devuelve el auth_user_id del profesional activo con ese id, o null. */
  getProfessionalAuthUserId: (professionalId: string) => Promise<string | null>
  /** Devuelve el professional_id asignado al paciente, o null. */
  getPatientProfessionalId: (patientId: string) => Promise<string | null>
}

/** Autoriza una llamada de profesional: el JWT debe ser del profesional y el paciente ser suyo. */
export async function authorizeProfessional(
  req: Request,
  deps: ProfessionalAuthDeps,
  professionalId: string,
  patientId: string,
  fnName: string
): Promise<AuthResult> {
  const jwt = extractUserJwt(req)
  if (!jwt) {
    if (accessCodeRequired()) return { ok: false, status: 401, error: 'JWT de profesional requerido' }
    console.warn(`[${fnName}] llamada de profesional sin JWT (modo compatibilidad) professional_id=${professionalId}`)
    return { ok: true, mode: 'legacy' }
  }
  const [userId, proAuthId, patientPro] = await Promise.all([
    deps.getUserId(jwt),
    deps.getProfessionalAuthUserId(professionalId),
    deps.getPatientProfessionalId(patientId),
  ])
  if (!userId || !proAuthId || userId !== proAuthId) {
    console.warn(`[${fnName}] JWT no corresponde a professional_id=${professionalId}`)
    return { ok: false, status: 403, error: 'Profesional no autorizado' }
  }
  if (patientPro !== professionalId) {
    console.warn(`[${fnName}] patient_id=${patientId} no pertenece a professional_id=${professionalId}`)
    return { ok: false, status: 403, error: 'El paciente no pertenece a este profesional' }
  }
  return { ok: true, mode: 'jwt' }
}
