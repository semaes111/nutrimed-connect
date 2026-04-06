// supabase/functions/nm-shopping/index.ts  v7
// allowedSet: SOLO food_knowledge + breakfast_catalog (NO meal_catalog)
// Pipeline: allowedSet filter → dedup cross-cat → cleanup categorías → rescue legumbres → consolidate water
// Fixes: Nata/Ricota eliminados (origen meal_catalog), Yogur edulcorado, Verduras variadas, Cereal integral

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const MIMO_KEY = Deno.env.get('MIMO_API_KEY') ?? 'tp-ec3qwryiudo64vlaplgfkkufznpmvklchsdoo2xxvp6vzni5'

const DIET_CODE_MAP: Record<string,string> = {
  // Claves base (sincronizadas con nm-chat — fuente de verdad)
  'metabolica':'D06','rescate':'D07','antioxidante':'D05',
  'antiinflamatoria':'D03','keto-microbiota':'D04',
  'ig-bajo':'D02','ig-medio':'D01','intermedio-integral':'D10',
  'embarazo':'D01','metabolica-antioxidante':'D06',
  // Variantes progresivas y compuestas
  'rescate-proteica':'D07','rescate-proteica-v2':'D08','rescate-proteica-v3':'D09',
  'antiinflamatoria-ig-bajo':'D03',
  'progresiva-ig-bajo':'D02','progresiva-ig-medio':'D01',
  'progresiva-intermedio-integral':'D10',
}
const BREAKFAST_NAME_MAP: Record<string,string> = {
  'D01':'Completo IG Intermedio','D02':'Completo IG Bajo',
  'D03':'Acelerado IG Bajo','D04':'Acelerado IG Bajo','D05':'Completo IG Bajo',
  'D06':'Acelerado IG Bajo','D07':'Acelerado Rescate',
  'D08':'Acelerado Rescate','D09':'Acelerado Rescate','D10':'Completo IG Intermedio',
}
const CATEGORIES = [
  'proteinas','hidratos','verduras','frutas','grasas',
  'lacteos','legumbres','especias','bebidas','snacks',
  'congelados','conservas',
] as const
type Cat = typeof CATEGORIES[number]
type Items = Record<Cat,string[]>

// Condimentos seguros en TODAS las dietas (no siempre en food_knowledge)
const SAFE_COOKING_TOKENS = new Set([
  'oregano','curry','pimenton','hierbas','hierbas aromaticas',
  'albahaca','romero','tomillo','laurel','comino','canela','jengibre','curcuma',
  'pimienta','pimienta negra','nuez moscada','azafran',
  'vinagre','vinagre manzana','limon','zumo limon',
  'aove','aceite oliva','aceite oliva virgen','sal','sal marina',
  'ajo','cebolla','puerro',
  'cafe','tes','te verde','infusiones','infusion',
])

const BLOCKED = new Set([
  'surimi','gulas','fritos','frito','rebozado','alcohol',
  'cerveza','vino','ron','whisky','cava',
  'azucar blanco','azucar refinado','bolleria',
  'harina blanca','pan blanco','arroz blanco',
  'leche condensada','mermelada','nutella','galletas',
  'patatas fritas','chips',
])

const GENERIC_TERMS = new Set([
  'verduras variadas','verduras','frutas variadas','frutas','proteinas',
  'cereales integrales','cereal integral','cereales','alimentos variados',
  'otros','varios',
])

const CONDITION_PATTERNS = [
  /m[áa]x\s*\d/i, /m[íi]n\s*\d/i, /\d+g\s*[\/\(]/i,
  /^(?:opci[óo]n|solo\s|solo si)/i,
  /edulcorad[oa]/i, /enriquecid[oa]/i,
  /sin az[úu]car\s*$/i, /con az[úu]car m[áa]x/i,
]

function isConditionString(s: string): boolean {
  return CONDITION_PATTERNS.some(p => p.test(s)) || s.length > 50
}

function norm(s: string): string {
  return s.toLowerCase()
    .replace(/[áàä]/g,'a').replace(/[éèë]/g,'e')
    .replace(/[íìï]/g,'i').replace(/[óòö]/g,'o')
    .replace(/[úùü]/g,'u').replace(/ñ/g,'n')
    .replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()
}

function tokenize(s: string): string[] {
  return norm(s)
    .split(/[,\/\(\)\[\]|;\n]+/)
    .flatMap(p => [p.trim(), ...p.trim().split(/\s+/)])
    .map(t => t.trim()).filter(t => t.length >= 3)
}

function buildAllowedSet(fk: Record<string,string>[], bkFields: string[]): Set<string> {
  const s = new Set<string>(SAFE_COOKING_TOKENS)
  for (const row of fk) {
    if (row.category === 'restriccion' || row.category === 'ensalada') continue
    for (const t of tokenize(row.name)) s.add(t)
  }
  for (const f of bkFields) for (const t of tokenize(f)) s.add(t)
  return s
}

function isAllowed(item: string, allowed: Set<string>): boolean {
  if (isConditionString(item)) return false
  const n = norm(item)
  if (GENERIC_TERMS.has(n)) return false
  for (const b of BLOCKED) if (n.includes(b)) return false
  return tokenize(item).some(t => allowed.has(t))
}

const DEDUP_PRIORITY: Partial<Record<Cat,Cat[]>> = {
  legumbres: ['proteinas','hidratos'],
  conservas: ['proteinas'],
}

function dedupCross(items: Items): Items {
  for (const [primary, others] of Object.entries(DEDUP_PRIORITY) as [Cat,Cat[]][]) {
    const pt = new Set((items[primary] ?? []).flatMap(tokenize))
    if (!pt.size) continue
    for (const other of others)
      items[other] = (items[other] ?? []).filter(i => !tokenize(i).some(t => pt.has(t)))
  }
  return items
}

const ENCURTIDO_RE = /encurt|pepinill|cebollita|jalape[ñn]|edamam|col ferment/i
const HUEVO_RE     = /^huevo/i

function cleanupCategories(items: Items): Items {
  const toSnacks:    string[] = []
  const toProteinas: string[] = []
  items.verduras = (items.verduras ?? []).filter(item => {
    if (ENCURTIDO_RE.test(item)) { toSnacks.push(item); return false }
    if (HUEVO_RE.test(item))     { toProteinas.push(item); return false }
    return true
  })
  items.especias = (items.especias ?? []).filter(item => {
    if (ENCURTIDO_RE.test(item)) { toSnacks.push(item); return false }
    return true
  })
  const snSet = new Set((items.snacks    ?? []).map(norm))
  const prSet = new Set((items.proteinas ?? []).map(norm))
  for (const s of toSnacks)    if (!snSet.has(norm(s)))  items.snacks.push(s)
  for (const p of toProteinas) if (!prSet.has(norm(p)))  items.proteinas.push(p)
  const alpha = (a: string, b: string) => norm(a).localeCompare(norm(b))
  items.snacks    = items.snacks.sort(alpha)
  items.proteinas = items.proteinas.sort(alpha)
  items.verduras  = items.verduras.sort(alpha)
  items.especias  = items.especias.sort(alpha)
  return items
}

function rescueLegumbres(items: Items, fk: Record<string,string>[]): Items {
  if ((items.legumbres ?? []).length >= 3) return items
  const legSet = new Set((items.legumbres ?? []).map(norm))
  for (const row of fk) {
    if (!((row.subcategory ?? '').toLowerCase().includes('legumbre'))) continue
    for (const part of row.name.split(/[,;]/)) {
      const clean = part.trim().replace(/\s*\(.*?\)/g,'').trim()
      if (clean && !legSet.has(norm(clean))) { items.legumbres.push(clean); legSet.add(norm(clean)) }
    }
  }
  items.legumbres = items.legumbres.sort((a,b) => norm(a).localeCompare(norm(b)))
  return items
}

function consolidateWater(items: Items): Items {
  const infused = (items.bebidas ?? []).filter(b => /agua infusion/i.test(b))
  if (infused.length > 1) {
    items.bebidas = [
      ...items.bebidas.filter(b => !/agua infusion/i.test(b)),
      'Agua infusionada'
    ].sort((a,b) => norm(a).localeCompare(norm(b)))
  }
  return items
}

const SYSTEM = `Eres un extractor de ingredientes para listas de la compra clínicas.
Dada la información de la dieta de un paciente, genera SOLO un objeto JSON con exactamente estas 12 claves:
"proteinas","hidratos","verduras","frutas","grasas","lacteos","legumbres","especias","bebidas","snacks","congelados","conservas"

Reglas estrictas:
- Cada clave: array de strings con ingredientes ESPECÍFICOS y CONCRETOS en español, sin cantidades
- PROHIBIDO: strings genéricos como "verduras variadas", "cereal integral", "proteínas"
- PROHIBIDO: strings que son condiciones clínicas como "yogur edulcorado", "leche enriquecida"
- "legumbres": SOLO legumbres enteras (lentejas, garbanzos, habas, guisantes, judías)
- "snacks": encurtidos, aceitunas, edamames, fermentados
- "grasas": SOLO aceite de oliva y aguacate (no lácteos como nata o cremas)
- "especias": condimentos secos (orégano, curry, pimentón) — NO salsas procesadas
- Cada array ordenado alfabéticamente, sin duplicados
- SOLO ingredientes que aparecen explícitamente en los platos y alimentos permitidos
- Sin markdown, SOLO el objeto JSON puro.`

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = {
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Headers':'Content-Type, Authorization',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
  }
  if (req.method === 'OPTIONS') return new Response(null,{status:204,headers:cors})
  if (req.method !== 'POST') return new Response(
    JSON.stringify({error:'Method not allowed'}),
    {status:405,headers:{...cors,'Content-Type':'application/json'}})

  try {
    const {patient_id, professional_id} = await req.json()
    if (!patient_id) return new Response(
      JSON.stringify({error:'patient_id requerido'}),
      {status:400,headers:{...cors,'Content-Type':'application/json'}})

    const db = createClient(SUPABASE_URL, SERVICE_KEY)

    const [{data:patient},{data:dietPlans},{data:dailyMeals}] = await Promise.all([
      db.from('nm_patients').select('full_name,food_intolerances').eq('id',patient_id).single(),
      db.from('nm_diet_plans').select('diet_type,diet_name,day_of_week,notes').eq('patient_id',patient_id).eq('is_active',true),
      db.from('nm_daily_meals').select('day_of_week,breakfast,lunch,dinner,snack_morning,snack_afternoon').eq('patient_id',patient_id).eq('is_active',true),
    ])

    const dietTypes = [...new Set((dietPlans ?? []).map((p:Record<string,string>) => p.diet_type))]
    const dietCodes = [...new Set(dietTypes.map((s:string) => DIET_CODE_MAP[s]).filter(Boolean))]

    let fkRows:   Record<string,string>[] = []
    let bkRows:   Record<string,string>[] = []
    let mealRows: Record<string,string>[] = []

    if (dietCodes.length > 0) {
      const bkNames = [...new Set(dietCodes.map((dc:string) => BREAKFAST_NAME_MAP[dc]).filter(Boolean))]
      const [fkRes,mealRes,bkRes] = await Promise.all([
        db.from('nm_food_knowledge').select('category,subcategory,name,details').overlaps('diet_codes',dietCodes),
        db.from('nm_meal_catalog').select('name,ingredients').overlaps('diet_codes',dietCodes).limit(60),
        db.from('nm_breakfast_catalog').select('name,drinks,bread,toppings,dairy,fruits,extras').in('name',bkNames),
      ])
      fkRows   = (fkRes.data  ?? []) as Record<string,string>[]
      mealRows = (mealRes.data?? []) as Record<string,string>[]
      bkRows   = (bkRes.data  ?? []) as Record<string,string>[]
    }

    // allowedSet: food_knowledge + breakfast_catalog ÚNICAMENTE (NO meal_catalog)
    const bkFields   = bkRows.flatMap(b =>
      ['drinks','bread','toppings','dairy','fruits','extras'].map(k => b[k]??'').filter(Boolean)
    )
    const allowedSet = buildAllowedSet(fkRows, bkFields)
    console.log(`[nm-shopping v7] allowedSet size: ${allowedSet.size}`)

    const dietSummary = (dietPlans ?? []).map((p:Record<string,string>) =>
      `${p.day_of_week==='todos'?'TODOS LOS DÍAS':p.day_of_week.toUpperCase()}: ${p.diet_name??p.diet_type}`
    ).join('\n')

    const dailyMealLines = (dailyMeals ?? []).map((m:Record<string,string>) => [
      `\n--- ${m.day_of_week.toUpperCase()} ---`,
      m.breakfast?`Desayuno: ${m.breakfast}`:null,
      m.snack_morning?`Media mañana: ${m.snack_morning}`:null,
      m.lunch?`Comida: ${m.lunch}`:null,
      m.snack_afternoon?`Merienda: ${m.snack_afternoon}`:null,
      m.dinner?`Cena: ${m.dinner}`:null,
    ].filter(Boolean).join('\n')).join('\n')

    const mealBlock = mealRows.length
      ? '\n=== PLATOS DE LA DIETA ===\n'+mealRows.map(m=>`${m.name}: ${m.ingredients??''}`).join('\n') : ''
    const bkBlock = bkRows.length
      ? '\n=== DESAYUNOS ===\n'+bkRows.map(b=>[
          `Tipo: ${b.name}`,
          b.drinks?`  Bebidas: ${b.drinks}`:null, b.bread?`  Pan: ${b.bread}`:null,
          b.toppings?`  Toppings: ${b.toppings}`:null, b.dairy?`  Lácteos: ${b.dairy}`:null,
          b.fruits?`  Frutas: ${b.fruits}`:null, b.extras?`  Extras: ${b.extras}`:null,
        ].filter(Boolean).join('\n')).join('\n\n') : ''
    const permBlock = '\n=== ALIMENTOS PERMITIDOS PARA ESTA DIETA ===\n'+
      fkRows.filter(r=>r.category!=='restriccion'&&r.category!=='ensalada')
            .map(r=>`[${(r.subcategory??r.category).toUpperCase()}] ${r.name}`).join('\n')

    const context = [
      `PACIENTE: ${patient?.full_name??''}`,
      patient?.food_intolerances?`INTOLERANCIAS (excluir): ${patient.food_intolerances}`:'',
      '\n=== PLAN SEMANAL ===', dietSummary,
      dailyMealLines?'\n=== MENÚS CONFIGURADOS ===':'', dailyMealLines,
      bkBlock, mealBlock, permBlock,
    ].filter(s=>s.trim()).join('\n')

    const ar = await fetch('https://token-plan-ams.xiaomimimo.com/anthropic/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':MIMO_KEY,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({
        model:'mimo-v2-pro',max_tokens:2000,system:SYSTEM,
        messages:[{role:'user',content:`Genera la lista de la compra semanal.\n\n${context}`}],
      }),
    })
    if (!ar.ok) return new Response(JSON.stringify({error:'Error IA'}),{status:502,headers:{...cors,'Content-Type':'application/json'}})
    const raw = ((await ar.json())?.content?.[0]?.text??'{}').replace(/```json|```/g,'').trim()

    let parsed: Record<string,unknown> = {}
    try { parsed = JSON.parse(raw) } catch(e) { console.error('[v7] parse:',e) }
    const rawItems: Items = {} as Items
    for (const cat of CATEGORIES) {
      rawItems[cat] = Array.isArray(parsed[cat])
        ? (parsed[cat] as unknown[]).map(s=>String(s)).filter(Boolean) : []
    }

    let removed = 0
    const filtered: Items = {} as Items
    for (const cat of CATEGORIES) {
      filtered[cat] = rawItems[cat].filter(item => {
        const ok = isAllowed(item, allowedSet)
        if (!ok) { console.log(`[v7] REMOVED [${cat}] "${item}"`); removed++ }
        return ok
      })
    }

    let items = dedupCross(filtered)
    items = cleanupCategories(items)
    items = rescueLegumbres(items, fkRows)
    items = consolidateWater(items)

    await db.from('nm_shopping_lists').update({is_current:false}).eq('patient_id',patient_id).eq('is_current',true)
    const {data:newList,error:ie} = await db
      .from('nm_shopping_lists')
      .insert({patient_id,professional_id:professional_id??null,diet_summary:dietSummary||null,items,is_current:true,generated_at:new Date().toISOString()})
      .select('id').single()
    if (ie) return new Response(JSON.stringify({error:'Error al guardar'}),{status:500,headers:{...cors,'Content-Type':'application/json'}})

    const total = Object.values(items).reduce((a,v)=>a+v.length,0)
    console.log(`[nm-shopping v7] OK items=${total} removed=${removed} id=${newList.id}`)
    return new Response(JSON.stringify({success:true,id:newList.id,total_items:total,removed}),
      {status:200,headers:{...cors,'Content-Type':'application/json'}})

  } catch(err) {
    console.error('[nm-shopping v7] unexpected:',err)
    return new Response(JSON.stringify({error:'Error interno'}),{status:500,headers:{...cors,'Content-Type':'application/json'}})
  }
})
