import { describe, expect, it, vi } from 'vitest'
import { authorizePatient, ownsConversation, unauthorized } from '../supabase/functions/_shared/patientAuth.ts'

const request = (token?: string) => new Request('https://example.test', {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
})
function fakeDb({ authorized = { id: 'a', professional_id: 'pro-a' }, user = null, tables = {} } = {}) {
  const traces: any[] = []
  const result = data => {
    const q = {
      select: vi.fn(() => q), eq: vi.fn(() => q),
      maybeSingle: vi.fn(async () => ({ data, error: null })),
    }
    traces.push(q)
    return q
  }
  return {
    traces,
    rpc: vi.fn(() => result(authorized)),
    from: vi.fn(table => result(tables[table] ?? null)),
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: user ? null : { message: 'invalid' } })) },
  }
}
describe('Edge authorization before PHI/AI work', () => {
  it('denies a bare patient_id and client-provided professional identity', async () => {
    const db = fakeDb()
    expect(await authorizePatient(db as any, request(), { patient_id: 'a' })).toBeNull()
    expect(db.from).not.toHaveBeenCalled()
  })
  it('accepts only the identity resolved from the credential', async () => {
    const db = fakeDb()
    expect(await authorizePatient(db as any, request(), { patient_id: 'a', access_code: ' code ' }))
      .toEqual({ patientId: 'a', professionalId: 'pro-a' })
    expect(db.rpc).toHaveBeenCalledWith('nm_app_autorizar', { p_codigo: 'CODE' })
  })
  it('denies code A + patient B', async () => {
    expect(await authorizePatient(fakeDb() as any, request(), { patient_id: 'b', access_code: 'CODE' })).toBeNull()
  })
  it('denies revoked codes, without falling back to a JWT', async () => {
    const db = fakeDb({ authorized: null })
    expect(await authorizePatient(db as any, request('jwt'), { patient_id: 'a', access_code: 'OLD' })).toBeNull()
    expect(db.auth.getUser).not.toHaveBeenCalled()
  })
  it('denies anon/service public keys as professional user JWTs', async () => {
    const db = fakeDb()
    expect(await authorizePatient(db as any, request('public-anon-key'), { patient_id: 'a' })).toBeNull()
    expect(db.from).not.toHaveBeenCalled()
  })
  it('denies a user without an active professional record', async () => {
    expect(await authorizePatient(fakeDb({ user: { id: 'u' } }) as any, request('jwt'), { patient_id: 'a' })).toBeNull()
  })
  it('requires verified user, active professional and assigned patient', async () => {
    const db = fakeDb({ user: { id: 'u' }, tables: {
      nm_professionals: { id: 'pro-a' }, nm_patients: { id: 'a', professional_id: 'pro-a' },
    } })
    expect(await authorizePatient(db as any, request('jwt'), { patient_id: 'a' }))
      .toEqual({ patientId: 'a', professionalId: 'pro-a' })
    expect(db.traces[0].eq).toHaveBeenCalledWith('is_active', true)
    expect(db.traces[1].eq).toHaveBeenCalledWith('professional_id', 'pro-a')
  })
  it('denies a conversation without matching patient ownership', async () => {
    const db = fakeDb()
    expect(await ownsConversation(db as any, 'a', 'conv-b')).toBe(false)
    expect(db.traces[0].eq).toHaveBeenCalledWith('patient_id', 'a')
  })
  it('does not include personal details in unauthorized responses', async () => {
    const response = unauthorized({ 'Access-Control-Allow-Origin': '*' })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Acceso no autorizado' })
  })
})
