// nm-shopping v8.0 — Generador DETERMINISTA (sin LLM)
// Fuente: nm_food_knowledge + nm_breakfast_catalog + nm_snack_catalog
// Zero API calls, instant, 100% reliable
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
const SB_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const DIET_CODE_MAP: Record<string, string> = {
  'metabolica': 'D06', 'rescate': 'D07', 'antioxidante': 'D05',
  'antiinflamatoria': 'D03', 'keto-microbiota': 'D04',
  'ig-bajo': 'D02', 'ig-medio': 'D01', 'intermedio-integral': 'D10',
  'embarazo': 'D01', 'metabolica-antioxidante': 'D06',
  'rescate-proteica': 'D07', 'rescate-proteica-v2': 'D08',
  'rescate-proteica-v3': 'D09', 'antiinflamatoria-ig-bajo': 'D03',
  'progresiva-ig-bajo': 'D02', 'progresiva-ig-medio': 'D01',
  'progresiva-intermedio-integral': 'D10',
}

const BREAKFAST_NAME_MAP: Record<string, string> = {
  'D01': 'Completo IG Intermedio', 'D02': 'Completo IG Bajo',
  'D03': 'Acelerado IG Bajo', 'D04': 'Acelerado IG Bajo',
  'D05': 'Completo IG Bajo', 'D06': 'Acelerado IG Bajo',
  'D07': 'Acelerado Rescate', 'D08': 'Acelerado Rescate',
  'D09': 'Acelerado Rescate', 'D10': 'Completo IG Intermedio',
}

const CATEGORIES = [
  'proteinas', 'hidratos', 'verduras', 'frutas', 'grasas',
  'lacteos', 'legumbres', 'especias', 'bebidas', 'snacks',
  'congelados', 'conservas',
] as const
type Cat = typeof CATEGORIES[number]
type Items = Record<Cat, string[]>

// Mapeo category de food_knowledge → categoría de shopping list
const FK_MAP: Record<string, Cat> = {
  'proteina': 'proteinas', 'carbohidrato': 'hidratos',
  'verdura': 'verduras', 'grasa_saludable': 'grasas',
  'conserva': 'conservas', 'embutido': 'conservas',
  'encurtido': 'snacks', 'bebida': 'bebidas',
}

const BASE_ESPECIAS = [
  'Aceite de oliva virgen extra', 'Ajo', 'Albahaca', 'Canela',
  'Cebolla', 'Comino', 'Cúrcuma', 'Jengibre', 'Laurel', 'Limón',
  'Orégano', 'Perejil', 'Pimienta negra', 'Pimentón', 'Romero',
  'Sal marina', 'Tomillo', 'Vinagre de manzana',
]

const BASE_CONGELADOS = [
  'Guisantes congelados', 'Judías verdes congeladas',
  'Verduras para sopa congeladas',
]

function cleanItem(s: string): string {
  return s
    .replace(/\s*\(.*?\)/g, '')
    .replace(/\s*x\d+/gi, '')
    .replace(/\s*\d+\/\d+\s*taza/gi, '')
    .replace(/^\s*opci[óo]n\s*\d+:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitItems(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map(s => cleanItem(s))
    .filter(s => s.length >= 3 && s.length < 60)
    .filter(s => !/^(sin |solo |con |máx |opci[óo]n)/i.test(s))
}

function norm(s: string): string {
  return s.toLowerCase()
    .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
    .replace(/ó/g, 'o').replace(/[úü]/g, 'u').replace(/ñ/g, 'n')
    .trim()
}

function dedup(arr: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of arr) {
    const n = norm(item)
    if (n.length < 3 || seen.has(n)) continue
    seen.add(n)
    result.push(item)
  }
  return result.sort((a, b) => norm(a).localeCompare(norm(b)))
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return new Response(
    JSON.stringify({ error: 'Method not allowed' }),
    { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } })

  try {
    const { patient_id, professional_id } = await req.json()
    if (!patient_id) return new Response(
      JSON.stringify({ error: 'patient_id requerido' }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })

    const db = createClient(SB_URL, SB_KEY)

    // 1. Datos del paciente + dietas
    const [{ data: patient }, { data: dietPlans }] = await Promise.all([
      db.from('nm_patients').select('full_name,food_intolerances').eq('id', patient_id).single(),
      db.from('nm_diet_plans').select('diet_type,diet_name,day_of_week').eq('patient_id', patient_id).eq('is_active', true),
    ])
    const dietTypes = [...new Set((dietPlans ?? []).map((p: Record<string, string>) => p.diet_type))]
    const dietCodes = [...new Set(dietTypes.map((s: string) => DIET_CODE_MAP[s]).filter(Boolean))]
    console.log(`[v8.0] patient=${patient?.full_name} codes=${dietCodes.join(',')}`)

    if (dietCodes.length === 0) {
      const emptyItems: Items = { proteinas: [], hidratos: [], verduras: [], frutas: [], grasas: [], lacteos: [], legumbres: [], especias: [], bebidas: [], snacks: [], congelados: [], conservas: [] }
      await db.from('nm_shopping_lists').update({ is_current: false }).eq('patient_id', patient_id).eq('is_current', true)
      const { data: nl } = await db.from('nm_shopping_lists').insert({
        patient_id, professional_id: professional_id ?? null,
        diet_summary: 'Sin dieta asignada', items: emptyItems,
        is_current: true, generated_at: new Date().toISOString(),
      }).select('id').single()
      return new Response(JSON.stringify({ success: true, id: nl?.id, total_items: 0, removed: 0, note: 'Sin dieta asignada' }),
        { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    // 2. Consultas paralelas a BD
    const bkNames = [...new Set(dietCodes.map((dc: string) => BREAKFAST_NAME_MAP[dc]).filter(Boolean))]
    const [{ data: fkData }, { data: bkData }, { data: snkData }] = await Promise.all([
      db.from('nm_food_knowledge').select('category,subcategory,name').overlaps('diet_codes', dietCodes),
      db.from('nm_breakfast_catalog').select('name,drinks,bread,toppings,dairy,fruits,extras').in('name', bkNames),
      db.from('nm_snack_catalog').select('name,items').overlaps('diet_codes', dietCodes).limit(20),
    ])
    const fk = (fkData ?? []) as Record<string, string>[]
    const bk = (bkData ?? []) as Record<string, string>[]
    const snk = (snkData ?? []) as Record<string, string>[]

    // 3. Construir items desde food_knowledge
    const items: Items = {
      proteinas: [], hidratos: [], verduras: [], frutas: [], grasas: [],
      lacteos: [], legumbres: [], especias: [...BASE_ESPECIAS],
      bebidas: [], snacks: [], congelados: [...BASE_CONGELADOS], conservas: [],
    }

    for (const row of fk) {
      if (row.category === 'restriccion' || row.category === 'ensalada') continue
      const cat = FK_MAP[row.category]
      if (!cat) continue
      const isLeg = (row.subcategory ?? '').toLowerCase().includes('legumbre')
      const targetCat = isLeg ? 'legumbres' : cat
      for (const p of splitItems(row.name)) {
        if (p) items[targetCat].push(p)
      }
    }

    // 4. Enriquecer desde breakfast_catalog
    for (const b of bk) {
      if (b.fruits) for (const f of splitItems(b.fruits)) if (f) items.frutas.push(f)
      if (b.dairy) for (const d of splitItems(b.dairy)) if (d) items.lacteos.push(d)
      if (b.drinks) for (const d of splitItems(b.drinks)) if (d) items.bebidas.push(d)
      if (b.bread) for (const p of splitItems(b.bread)) if (p) items.hidratos.push(p)
      if (b.toppings) for (const t of splitItems(b.toppings)) if (t) items.grasas.push(t)
      if (b.extras) for (const e of splitItems(b.extras)) if (e) items.snacks.push(e)
    }

    // 5. Snack catalog
    for (const s of snk) {
      if (s.items) for (const i of splitItems(s.items)) if (i) items.snacks.push(i)
    }

    // 6. Intolerancias: filtrar si aplica
    const intol = patient?.food_intolerances?.toLowerCase() ?? ''
    const intolWords = intol ? intol.split(/[,;]+/).map((w: string) => w.trim().toLowerCase()).filter((w: string) => w.length >= 3) : []

    // 7. Deduplicar, filtrar y ordenar
    let totalRemoved = 0
    for (const cat of CATEGORIES) {
      const before = items[cat].length
      let cleaned = dedup(items[cat])
      if (intolWords.length > 0) {
        cleaned = cleaned.filter(item => !intolWords.some(w => norm(item).includes(w)))
      }
      items[cat] = cleaned
      totalRemoved += (before - cleaned.length)
    }

    // 8. Diet summary
    const dietSummary = (dietPlans ?? []).map((p: Record<string, string>) =>
      `${p.day_of_week === 'todos' ? 'TODOS' : p.day_of_week.toUpperCase()}: ${p.diet_name ?? p.diet_type}`
    ).join('\n')

    // 9. Guardar en BD
    await db.from('nm_shopping_lists').update({ is_current: false }).eq('patient_id', patient_id).eq('is_current', true)
    const { data: newList, error: ie } = await db.from('nm_shopping_lists').insert({
      patient_id, professional_id: professional_id ?? null,
      diet_summary: dietSummary || null, items,
      is_current: true, generated_at: new Date().toISOString(),
    }).select('id').single()
    if (ie) {
      console.error('[v8.0] insert:', ie)
      return new Response(JSON.stringify({ error: 'Error al guardar' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    const total = Object.values(items).reduce((a, v) => a + v.length, 0)
    console.log(`[v8.0] OK patient=${patient?.full_name} items=${total} deduped=${totalRemoved} id=${newList?.id}`)
    return new Response(JSON.stringify({ success: true, id: newList?.id, total_items: total, removed: totalRemoved }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('[v8.0]', err)
    return new Response(JSON.stringify({ error: 'Error interno' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
