import { describe, expect, it, vi } from 'vitest'
import { authenticatePatient, patientRpc, restorePatientSession } from '../src/lib/patientAccess.js'

function client(data = { id: 'patient-a' }, error = null) {
  return { rpc: vi.fn(() => ({ maybeSingle: async () => ({ data, error }) })) }
}

describe('patient credential boundary', () => {
  it('normalizes the submitted code and only calls login RPC', async () => {
    const db = client()
    expect(await authenticatePatient(db, ' abCd ')).toEqual({ patient: { id: 'patient-a' }, code: 'ABCD' })
    expect(db.rpc).toHaveBeenCalledWith('nm_app_login', { p_codigo: 'ABCD' }, undefined)
  })
  it('rejects an invalid code without restoring profile', async () => {
    await expect(authenticatePatient(client(null), 'WRONG')).rejects.toThrow('Código no válido')
  })
  it('does not expose database errors', async () => {
    await expect(authenticatePatient(client(null, { message: 'internal secret' }), 'CODE')).rejects.toThrow('No se pudo comprobar')
  })
  it('never uses stored patient_id without a code', async () => {
    const db = client()
    expect(await restorePatientSession(db, JSON.stringify({ patient_id: 'patient-a' }))).toBeNull()
    expect(db.rpc).not.toHaveBeenCalled()
  })
  it('revalidates blocked/expired sessions on the server even with forged local expiry', async () => {
    const db = client(null)
    await expect(restorePatientSession(db, JSON.stringify({ patient_id: 'patient-a', code: 'OLD', expires_at: '9999-01-01' }))).rejects.toThrow('Código no válido')
    expect(db.rpc).toHaveBeenCalledOnce()
  })
  it('rejects a forged stored patient identity with a valid code for someone else', async () => {
    expect(await restorePatientSession(client(), JSON.stringify({ patient_id: 'patient-b', code: 'VALID' }))).toBeNull()
  })
  it.each(['broken json', 'null', '{}'])('fails closed for invalid stored session: %s', async input => {
    const db = client()
    expect(await restorePatientSession(db, input)).toBeNull()
    expect(db.rpc).not.toHaveBeenCalled()
  })
  it('does not allow args to replace the session code', () => {
    const db = client()
    patientRpc(db, 'OWN', 'nm_app_mensajes', { p_codigo: 'OTHER', p_conversation_id: 'other-conversation' })
    expect(db.rpc).toHaveBeenCalledWith('nm_app_mensajes', { p_codigo: 'OWN', p_conversation_id: 'other-conversation' }, undefined)
  })
  it('rejects requests with no credential', () => {
    const db = client()
    expect(() => patientRpc(db, null, 'nm_app_pesos')).toThrow()
    expect(db.rpc).not.toHaveBeenCalled()
  })
})
