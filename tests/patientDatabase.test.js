import { readFileSync, readdirSync } from 'node:fs'
import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

const migration = readdirSync('supabase/migrations').find(f => f.endsWith('_nm_patient_access_hardened.sql'))
const closeSQL = readFileSync('supabase/deploy/nm_close_anonymous_access.sql', 'utf8')
const rotateSQL = readFileSync('supabase/deploy/nm_rotate_exposed_codes.sql', 'utf8')
const transactionBody = text => text.replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '')
const ids = {
  proA: '10000000-0000-0000-0000-000000000001', proB: '10000000-0000-0000-0000-000000000002',
  userA: '20000000-0000-0000-0000-000000000001', userB: '20000000-0000-0000-0000-000000000002',
  a: '30000000-0000-0000-0000-000000000001', b: '30000000-0000-0000-0000-000000000002',
  ca: '40000000-0000-0000-0000-000000000001', cb: '40000000-0000-0000-0000-000000000002',
}
const clinical = ['nm_patients','nm_access_codes','nm_weight_records','nm_medications',
  'nm_chat_conversations','nm_chat_messages','nm_daily_meals','nm_diet_plans','nm_shopping_lists']
let db
const rows = async (query, args = []) => (await db.query(query, args)).rows
const login = code => rows('select id from public.nm_app_login($1)', [code])
const role = async (name, user = '') => {
  await db.exec(`SET LOCAL ROLE ${name}`)
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [user])
}
async function rejectsSQL(query, args = [], message) {
  await db.exec('SAVEPOINT expected_failure')
  try {
    await expect(db.query(query, args)).rejects.toThrow(message)
  } finally {
    await db.exec('ROLLBACK TO SAVEPOINT expected_failure; RELEASE SAVEPOINT expected_failure')
  }
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  `)
  // Existing repository 001 contains unsupported CREATE POLICY IF NOT EXISTS.
  // Load its actual table/RLS DDL, then seed explicit adversarial legacy policies below.
  const baseline = readFileSync('supabase/migrations/001_nm_tables.sql', 'utf8').split('-- Service role:')[0]
  await db.exec(baseline)
  const shopping = readFileSync('supabase/migrations/002_nm_shopping_list.sql', 'utf8').split('-- Service role:')[0]
  await db.exec(shopping)
  await db.exec(`CREATE UNIQUE INDEX daily_meal_patient_day ON nm_daily_meals(patient_id,day_of_week);
    CREATE TABLE nm_informes_paciente(id uuid PRIMARY KEY, contenido_json jsonb, deleted_at timestamptz);
    ALTER TABLE nm_informes_paciente ENABLE ROW LEVEL SECURITY;
    CREATE VIEW nm_informes_paciente_active AS SELECT * FROM nm_informes_paciente WHERE deleted_at IS NULL;
    GRANT ALL ON nm_informes_paciente, nm_informes_paciente_active TO PUBLIC;
    INSERT INTO nm_informes_paciente VALUES (gen_random_uuid(), '{"synthetic":true}', NULL);
    CREATE FUNCTION nm_cleanup_run() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS
      $$ BEGIN RAISE EXCEPTION 'Cleanup must not be invoked during verification'; END $$;
    CREATE FUNCTION process_form_intake(uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS
      $$ BEGIN RETURN upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)); END $$;
  `)
  for (const table of clinical) {
    await db.exec(`GRANT ALL ON public.${table} TO PUBLIC;
      CREATE POLICY old_public_access ON public.${table} FOR ALL TO PUBLIC USING (true) WITH CHECK (true);`)
  }
  await db.query(`insert into nm_professionals(id,auth_user_id,full_name,email) values ($1,$2,'Synthetic professional A','a@example.invalid'),($3,$4,'Synthetic professional B','b@example.invalid')`,
    [ids.proA, ids.userA, ids.proB, ids.userB])
  await db.query(`insert into nm_patients(id,professional_id,assigned_doctor,full_name,access_code,code_expiry,current_weight)
    values ($1,$2,'A','Synthetic A','CODEA',now()+interval '10 days',80),($3,$4,'B','Synthetic B','CODEB',now()+interval '10 days',90)`,
    [ids.a, ids.proA, ids.b, ids.proB])
  await db.exec(`insert into nm_access_codes(patient_id,access_code,code_expiry)
    select id,access_code,code_expiry from nm_patients;`)
  await db.query(`insert into nm_weight_records(patient_id,weight,date) values ($1,80,current_date-1),($2,90,current_date-1)`, [ids.a, ids.b])
  await db.query(`insert into nm_medications(patient_id,medication_name) values ($1,'Synthetic A'),($2,'Synthetic B')`, [ids.a, ids.b])
  await db.query(`insert into nm_chat_conversations(id,patient_id) values ($1,$2),($3,$4)`, [ids.ca, ids.a, ids.cb, ids.b])
  await db.query(`insert into nm_chat_messages(conversation_id,role,content) values ($1,'user','Synthetic A'),($2,'user','Synthetic B')`, [ids.ca, ids.cb])
  await db.query(`insert into nm_diet_plans(patient_id,diet_type,day_of_week) values ($1,'test','lunes'),($2,'test','lunes')`, [ids.a, ids.b])
  await db.query(`insert into nm_daily_meals(patient_id,professional_id,day_of_week) values ($1,$2,'lunes'),($3,$4,'lunes')`, [ids.a, ids.proA, ids.b, ids.proB])
  await db.query(`insert into nm_shopping_lists(patient_id) values ($1),($2)`, [ids.a, ids.b])
  await db.exec(readFileSync('tests/fixtures/nm-legacy-rpcs.sql', 'utf8'))
  await db.exec(readFileSync(`supabase/migrations/${migration}`, 'utf8'))
}, 30000)
beforeEach(async () => { await db.exec('BEGIN') })
afterEach(async () => { await db.exec('ROLLBACK') })
afterAll(async () => { await db.close() })

describe('credential resolver in PostgreSQL (synthetic data)', () => {
  it('accepts valid code, normalization; rejects invalid/null/blank/short codes', async () => {
    await role('anon')
    expect(await login(' codea ')).toEqual([{ id: ids.a }])
    for (const code of ['WRONG', null, '', 'A', ' '.repeat(4), 'X'.repeat(65)]) expect(await login(code)).toEqual([])
  })
  it.each(['access-blocked','access-expired','patient-blocked','patient-expired'])('rejects %s without legacy fallback', async condition => {
    const table = condition.startsWith('access') ? 'nm_access_codes' : 'nm_patients'
    const key = table === 'nm_patients' ? 'id' : 'patient_id'
    const assignment = condition.endsWith('blocked') ? 'is_blocked = true' : "code_expiry = now() - interval '1 second'"
    await db.query(`update ${table} set ${assignment} where ${key}=$1`, [ids.a])
    await role('anon')
    expect(await login('CODEA')).toEqual([])
  })
  it('does not accept an old patient-table code when the canonical code changed', async () => {
    await db.query("update nm_access_codes set access_code='NEWCODE' where patient_id=$1", [ids.a])
    await role('anon')
    expect(await login('CODEA')).toEqual([])
    expect(await login('NEWCODE')).toEqual([]) // inconsistent stores fail closed
  })
  it('supports a legacy-only code, still respecting patient blocking and expiry', async () => {
    await db.query('delete from nm_access_codes where patient_id=$1', [ids.a])
    await role('anon')
    expect(await login('CODEA')).toEqual([{ id: ids.a }])
  })
  it('rejects collisions across patients, including across both code stores', async () => {
    await db.query("update nm_patients set access_code='CODEA' where id=$1", [ids.b])
    await role('anon')
    expect(await login('CODEA')).toEqual([])
  })
  it('rejects multiple access records for the same patient', async () => {
    await db.query("insert into nm_access_codes(patient_id,access_code,code_expiry) values ($1,'CODEA',now()+interval '1 day')", [ids.a])
    await role('anon')
    expect(await login('CODEA')).toEqual([])
  })
  it('denies direct resolver and server-only authorization RPC to anon', async () => {
    await role('anon')
    await rejectsSQL('select nm_app_paciente_id($1)', ['CODEA'], /permission denied/)
    await rejectsSQL('select * from nm_app_autorizar($1)', ['CODEA'], /permission denied/)
    await rejectsSQL('select nm_private.patient_id($1)', ['CODEA'], /permission denied/)
  })
  it('allows server-only authorization without clinical columns', async () => {
    await role('service_role')
    expect(await rows('select * from nm_app_autorizar($1)', ['CODEA']))
      .toEqual([{ id: ids.a, professional_id: ids.proA }])
  })
})

describe('cutover enforces patient and professional isolation', () => {
  beforeEach(async () => { await db.exec(transactionBody(closeSQL)) })
  it('denies every direct anonymous clinical read despite a PUBLIC allow-all policy', async () => {
    await role('anon')
    for (const table of clinical) expect(await rows(`select id from ${table}`)).toEqual([])
  })
  it('keeps every valid patient read available through RPC after table closure', async () => {
    await role('anon')
    expect(await login('CODEA')).toEqual([{ id: ids.a }])
    for (const rpc of ['nm_app_pesos','nm_app_medicaciones','nm_app_conversaciones','nm_app_comidas','nm_app_dietas','nm_app_lista_compra']) {
      const data = await rows(`select * from ${rpc}($1)`, ['CODEA'])
      expect(data).toHaveLength(1)
      expect(data[0].patient_id).toBe(ids.a)
    }
    expect(await rows('select * from nm_app_mensajes($1,$2)', ['CODEA', ids.cb])).toEqual([])
    expect(await rows('select content from nm_app_mensajes($1,$2)', ['CODEA', ids.ca])).toEqual([{ content: 'Synthetic A' }])
  })
  it('denies anonymous direct writes', async () => {
    await role('anon')
    await rejectsSQL('insert into nm_weight_records(patient_id,weight) values ($1,77)', [ids.a], /row-level security/)
    expect(await rows('update nm_patients set current_weight=77 where id=$1 returning id', [ids.a])).toEqual([])
    await rejectsSQL("insert into nm_chat_messages(conversation_id,role,content) values ($1,'user','fake')", [ids.cb], /row-level security/)
  })
  it('denies an unrelated authenticated account', async () => {
    await role('authenticated', '20000000-0000-0000-0000-000000000099')
    for (const table of clinical) expect(await rows(`select id from ${table}`)).toEqual([])
  })
  it('allows professional A only its own records and denies reassignment', async () => {
    await role('authenticated', ids.userA)
    expect(await rows('select id from nm_patients')).toEqual([{ id: ids.a }])
    for (const table of clinical.filter(t => !['nm_patients','nm_chat_messages'].includes(t))) {
      const data = await rows(`select patient_id from ${table}`)
      expect(data).toHaveLength(1)
      expect(data[0].patient_id).toBe(ids.a)
    }
    expect(await rows('select content from nm_chat_messages')).toEqual([{ content: 'Synthetic A' }])
    await rejectsSQL('update nm_patients set professional_id=$1 where id=$2', [ids.proB, ids.a], /row-level security/)
    await rejectsSQL('update nm_weight_records set patient_id=$1 where patient_id=$2', [ids.b, ids.a], /row-level security/)
    expect(await rows('update nm_patients set current_weight=79 where id=$1 returning id', [ids.a])).toHaveLength(1)
  })
  it('protects legacy professional RPCs against anonymous use and definer bypass', async () => {
    await role('anon')
    await rejectsSQL('select * from get_patient_weekly_diet($1)', [ids.a], /permission denied/)
    await role('authenticated', ids.userA)
    expect(await rows('select diet_type from get_patient_weekly_diet($1)', [ids.a])).toEqual([{ diet_type: 'test' }])
    expect(await rows('select * from get_patient_weekly_diet($1)', [ids.b])).toEqual([])
  })
  it('keeps the five real professional RPCs working within ownership boundaries', async () => {
    await role('authenticated', ids.userA)
    await rows("select assign_base_diet($1,$2,null,'base')", [ids.a, ids.proA])
    await rows("select override_day_diet($1,$2,null,'override','martes')", [ids.a, ids.proA])
    const week = await rows('select * from get_patient_weekly_diet($1)', [ids.a])
    expect(week).toHaveLength(7)
    expect(week.find(day => day.day_of_week === 'martes').diet_type).toBe('override')
    await rows("select remove_day_override($1,'martes')", [ids.a])
    await rows("select upsert_daily_meal($1,$2,'martes','synthetic breakfast')", [ids.a, ids.proA])
    await rows("select upsert_daily_meal($1,$2,'martes','updated breakfast')", [ids.a, ids.proA])
    expect(await rows('select breakfast from nm_daily_meals where patient_id=$1', [ids.a]))
      .toEqual([{ breakfast: 'updated breakfast' }])
    await rejectsSQL("select assign_base_diet($1,$2,null,'forbidden')", [ids.b, ids.proB], /row-level security/)
    await rejectsSQL("select override_day_diet($1,$2,null,'forbidden','martes')", [ids.b, ids.proB], /row-level security/)
    await rejectsSQL("select upsert_daily_meal($1,$2,'lunes','forbidden')", [ids.b, ids.proB], /row-level security/)
    expect((await rows("select remove_day_override($1,'lunes') result", [ids.b]))[0].result.success).toBe(false)
    await role('authenticated', ids.userB)
    expect(await rows('select diet_type from nm_diet_plans where patient_id=$1', [ids.b])).toEqual([{ diet_type: 'test' }])
  })
  it('closes the owner-bypassing report view and privileged maintenance functions', async () => {
    for (const name of ['anon', 'authenticated']) {
      await role(name, ids.userA)
      await rejectsSQL('select * from nm_informes_paciente_active', [], /permission denied/)
      await rejectsSQL('select * from nm_informes_paciente', [], /permission denied/)
      await rejectsSQL('select nm_cleanup_run()', [], /permission denied/)
      await rejectsSQL('select process_form_intake($1)', [ids.a], /permission denied/)
    }
    await role('service_role')
    expect(await rows('select * from nm_informes_paciente_active')).toHaveLength(1)
    expect((await rows('select process_form_intake($1) code', [ids.a]))[0].code).toMatch(/^[A-F0-9]{32}$/)
  })
  it('revokes table-wide destructive privileges that RLS cannot constrain', async () => {
    await role('authenticated', ids.userA)
    await rejectsSQL('truncate nm_weight_records', [], /permission denied/)
  })
  it('saves and updates weight through RPC without changing another patient', async () => {
    await role('anon')
    const first = await rows('select * from nm_app_guardar_peso($1,$2)', ['CODEA',79])
    const second = await rows('select * from nm_app_guardar_peso($1,$2)', ['CODEA',78])
    expect(first[0].id).toBe(second[0].id)
    expect(second[0].patient_id).toBe(ids.a)
    expect((await rows("select current_weight from nm_app_login('CODEA')"))[0].current_weight).toBe('78')
    expect((await rows("select current_weight from nm_app_login('CODEB')"))[0].current_weight).toBe('90')
    await rejectsSQL('select * from nm_app_guardar_peso($1,$2)', ['WRONG',77], /Acceso no autorizado/)
    for (const weight of [-1, 301, 'NaN']) await rejectsSQL('select * from nm_app_guardar_peso($1,$2)', ['CODEA',weight], /Registro no válido/)
  })
  it('rolls back the record if updating the patient fails', async () => {
    await db.exec(`CREATE FUNCTION nm_private.reject_weight() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$;
      CREATE TRIGGER reject_weight BEFORE UPDATE OF current_weight ON nm_patients FOR EACH ROW EXECUTE FUNCTION nm_private.reject_weight();`)
    await role('anon')
    await rejectsSQL("select * from nm_app_guardar_peso('CODEA',77)", [], /synthetic failure/)
    expect(await rows("select weight from nm_app_pesos('CODEA')")).toEqual([{ weight: '80' }])
  })
})

describe('code lifecycle', () => {
  it('atomically regenerates both stores and invalidates the old code', async () => {
    await role('authenticated', ids.userA)
    const [{ access_code: code }] = await rows('select * from nm_pro_regenerar_codigo($1)', [ids.a])
    expect(code).toMatch(/^[A-F0-9]{32}$/)
    expect(await login('CODEA')).toEqual([])
    expect(await login(code)).toEqual([{ id: ids.a }])
    await rejectsSQL('select * from nm_pro_regenerar_codigo($1)', [ids.b], /Acceso no autorizado/)
    await rows('select nm_pro_bloquear_acceso($1,true)', [ids.a])
    expect(await login(code)).toEqual([])
    await rows('select nm_pro_bloquear_acceso($1,false)', [ids.a])
    expect(await login(code)).toEqual([{ id: ids.a }])
  })
  it('refuses bulk rotation before closure', async () => {
    await db.exec('SAVEPOINT expected_failure')
    await expect(db.exec(transactionBody(rotateSQL))).rejects.toThrow('Close and verify')
    await db.exec('ROLLBACK TO SAVEPOINT expected_failure')
  })
  it('rotates once, preserves blocking/expiry, and never returns the codes', async () => {
    await db.query('update nm_access_codes set is_blocked=true where patient_id=$1', [ids.b])
    await db.exec(transactionBody(closeSQL))
    const expiryBefore = await rows('select code_expiry from nm_patients order by id')
    const results = await db.exec(transactionBody(rotateSQL))
    expect(results.at(-1).rows).toEqual([{ patients_rotated: 2 }])
    expect(await rows('select code_expiry from nm_patients order by id')).toEqual(expiryBefore)
    expect(await login('CODEA')).toEqual([])
    expect(await login('CODEB')).toEqual([])
    const fresh = await rows('select access_code, is_blocked from nm_patients order by id')
    expect(await login(fresh[0].access_code)).toEqual([{ id: ids.a }])
    expect(fresh[1].is_blocked).toBe(true)
    expect(await login(fresh[1].access_code)).toEqual([])
    expect(await rows('select affected_patients from nm_private.security_actions')).toEqual([{ affected_patients: 2 }])
    await db.exec('SAVEPOINT expected_failure')
    await expect(db.exec(transactionBody(rotateSQL))).rejects.toThrow('already been applied')
    await db.exec('ROLLBACK TO SAVEPOINT expected_failure')
  })
})
