// The service client is server-only. A patient ID from JSON never authorizes access.
// This small module deliberately has no runtime imports so it can be tested in Vitest.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.98.0'

export type PatientAuthorization = { patientId: string; professionalId: string }

function isPatientIdentity(value: unknown): value is { id: string; professional_id: string } {
  if (!value || typeof value !== 'object') return false
  const identity = value as Record<string, unknown>
  return typeof identity.id === 'string' && typeof identity.professional_id === 'string'
}

export async function authorizePatient(
  db: SupabaseClient,
  request: Request,
  body: { patient_id?: unknown; access_code?: unknown },
): Promise<PatientAuthorization | null> {
  if (typeof body.patient_id !== 'string' || !body.patient_id) return null
  if (typeof body.access_code === 'string' && body.access_code.trim()) {
    const { data, error } = await db.rpc('nm_app_autorizar', {
      p_codigo: body.access_code.trim().toUpperCase(),
    }).maybeSingle()
    if (error || !isPatientIdentity(data) || data.id !== body.patient_id) return null
    return { patientId: data.id, professionalId: data.professional_id }
  }
  // Professionals use a verified Supabase user JWT and must own this patient.
  // Never trust a client-provided professional_id or decoded-but-unverified JWT.
  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!bearer) return null
  const { data: auth, error: authError } = await db.auth.getUser(bearer)
  if (authError || !auth.user) return null
  const { data: professional, error: proError } = await db.from('nm_professionals')
    .select('id').eq('auth_user_id', auth.user.id).eq('is_active', true).maybeSingle()
  if (proError || !professional) return null
  const { data: patient, error: patientError } = await db.from('nm_patients')
    .select('id,professional_id').eq('id', body.patient_id)
    .eq('professional_id', professional.id).maybeSingle()
  if (patientError || !patient) return null
  return { patientId: patient.id, professionalId: patient.professional_id }
}

export async function ownsConversation(db: SupabaseClient, patientId: string, conversationId: string) {
  const { data, error } = await db.from('nm_chat_conversations').select('id')
    .eq('id', conversationId).eq('patient_id', patientId).maybeSingle()
  return !error && !!data
}

export function unauthorized(cors: Record<string, string>) {
  return new Response(JSON.stringify({ error: 'Acceso no autorizado' }), {
    status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
