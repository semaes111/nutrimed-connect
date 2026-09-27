// Every patient request authenticates with the code; patient_id is never a credential.
export function normalizePatientCode(code) {
  return typeof code === 'string' ? code.trim().toUpperCase() : ''
}

export function patientRpc(client, code, name, args = {}, options) {
  const normalized = normalizePatientCode(code)
  if (!normalized) throw new Error('Vuelve a introducir tu código de acceso.')
  return client.rpc(name, { ...args, p_codigo: normalized }, options)
}

export async function authenticatePatient(client, code) {
  const normalized = normalizePatientCode(code)
  const { data, error } = await patientRpc(client, normalized, 'nm_app_login').maybeSingle()
  if (error) throw new Error('No se pudo comprobar el acceso. Inténtalo de nuevo.')
  if (!data) throw new Error('Código no válido, caducado o bloqueado. Contacta con tu consulta.')
  return { patient: data, code: normalized }
}

export async function restorePatientSession(client, serialized) {
  if (!serialized) return null
  let stored
  try { stored = JSON.parse(serialized) } catch { return null }
  if (!stored || !normalizePatientCode(stored.code)) return null
  // The database revalidates expiry and blocking. Local dates/IDs cannot grant access.
  const result = await authenticatePatient(client, stored.code)
  if (stored.patient_id && stored.patient_id !== result.patient.id) return null
  return result
}
