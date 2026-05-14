import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

// ═══════════════════════════════════════════════════════════════════════
// nm-scanner v2.3 — Rotate revoked MiMo API key fallback (2026-05-14)
//   Old key tp-ec3qwry... was revoked, causing HTTP 401 from MiMo and
//   HTTP 500 in this EF. Fallback updated to active key. TODO follow-up
//   commit: remove hardcoded fallback entirely once MIMO_API_KEY secret
//   is set in Supabase Edge Function vault.
//
// nm-scanner v2.2 — Fix max_tokens for MiMo thinking blocks
//   v1 confundía kcal/kJ (valor energético) con azúcares. El prompt ahora
//   describe la estructura jerárquica y prohíbe usar calorías como azúcares.
//
// Pipeline de 4 fases:
//   1. VISIÓN      — Haiku extrae azúcares/100g y categoría del producto
//   2. DIETA       — Supabase carga alimentos permitidos (UNION semana)
//   3. DIETÉTICO   — Haiku decide si el producto está en la dieta
//   4. VEREDICTO   — TypeScript aplica doble criterio (dieta + umbral 4g)
//
// Contratos:
//   - verify_jwt: false (llamada directa desde frontend autenticado)
//   - CERO cambios de schema — usa nm_diet_plans + nm_food_knowledge existentes
//   - Stateless — no persiste resultados en BD
//   - DIET_CODE_MAP sincronizado con nm-chat v16 y constants.js frontend
// ═══════════════════════════════════════════════════════════════════════

const MODEL_VISION = 'mimo-v2-omni'
const MODEL_DIET   = 'mimo-v2.5'
const SUGAR_THRESHOLD = 4.0

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ─── MAPEO DIET_CODE — sincronizado con nm-chat v16 y constants.js ────
const DIET_CODE_MAP: Record<string, string> = {
  'metabolica': 'D06',                      'rescate': 'D07',
  'antioxidante': 'D05',                    'antiinflamatoria': 'D03',
  'keto-microbiota': 'D04',                 'ig-bajo': 'D02',
  'ig-medio': 'D01',                        'intermedio-integral': 'D10',
  'embarazo': 'D01',                        'metabolica-antioxidante': 'D06',
  'rescate-proteica': 'D07',               'rescate-proteica-v2': 'D08',
  'rescate-proteica-v3': 'D09',            'antiinflamatoria-ig-bajo': 'D03',
  'progresiva-ig-bajo': 'D02',             'progresiva-ig-medio': 'D01',
  'progresiva-intermedio-integral': 'D10',
}

// ─── Tipos ─────────────────────────────────────────────────────────────
interface VisionResult {
  product_category: string
  sugar_g_per_100: number | null
  confidence: 'high' | 'medium' | 'low'
  raw_text_found: string
}

interface DietResult {
  in_diet: boolean
  matched_food: string | null
}

type Reason =
  | 'approved'
  | 'not_in_diet'
  | 'sugar_too_high'
  | 'both_fail'
  | 'unreadable'
  | 'no_diet_assigned'

interface ScanResponse {
  allowed: boolean | null
  reason: Reason
  sugar_g_per_100: number | null
  threshold: number
  product_category: string
  matched_food: string | null
  confidence: string
}

// ─── Llamada a MiMo API ───────────────────────────────────────────
async function callMiMo(
  messages: object[],
  systemPrompt: string,
  maxTokens = 256,
  model = MODEL_VISION
): Promise<string> {
  const apiKey = Deno.env.get('MIMO_API_KEY') ?? 'tp-ee9sggxsekiv1h86ecfa4koyjp4s1mvwo1rtqppfgwxuaeud'
  const res = await fetch('https://token-plan-ams.xiaomimimo.com/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`MiMo API error ${res.status}: ${err}`)
  }
  const data = await res.json()
  const textBlock = (data.content || []).find((b: {type:string}) => b.type === 'text')
  return textBlock?.text ?? data.content?.[0]?.text ?? ''
}

// ─── Parseo seguro de JSON desde respuesta de modelo ──────────────────
function safeParseJSON<T>(raw: string): T | null {
  try {
    const clean = raw.replace(/```json|```/g, '').trim()
    return JSON.parse(clean) as T
  } catch {
    return null
  }
}

// ─── FASE 1 — Visión: extraer azúcares y categoría del producto ───────
async function phaseVision(
  imageBase64: string,
  mimeType: string
): Promise<VisionResult> {
  // ── Defensive sanitization (v2.5 fix) ────────────────────────────────
  // Frontend may send base64 with data URI prefix ("data:image/jpeg;base64,XXX")
  // or with non-canonical mime ("image/jpg" instead of "image/jpeg"). MiMo
  // rejects both with HTTP 400, which surfaced as "Error interno del servidor"
  // for users. Strip prefix and normalize mime here for compatibility.
  const cleanBase64 = imageBase64.startsWith('data:')
    ? imageBase64.replace(/^data:[^;,]+;base64,/, '')
    : imageBase64
  const cleanMime = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType

  const system = `Eres un experto en lectura de tablas nutricionales de etiquetas de productos alimentarios.
Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin markdown, sin explicaciones.`

  const userText = `Analiza esta etiqueta nutricional y extrae EXACTAMENTE los campos indicados.

ESTRUCTURA TÍPICA DE UNA TABLA NUTRICIONAL (por cada 100g/100ml):
  Valor energético    → X kcal / Y kJ   ← ESTO SON CALORÍAS, NO AZÚCARES. IGNÓRALO.
  Grasas              → X g
    de las cuales saturadas → X g
  Hidratos de carbono → X g             ← ESTE ES EL TOTAL DE CARBOHIDRATOS, NO AZÚCARES
    de los cuales azúcares → X g        ← ✅ ESTE ES EL CAMPO QUE BUSCAS
  Fibra alimentaria   → X g
  Proteínas           → X g
  Sal                 → X g

REGLAS ESTRICTAS:
- sugar_g_per_100 debe ser el valor de la fila "de los cuales azúcares" / "of which sugars" / "dont les sucres" / "davon Zucker"
- NUNCA uses el valor energético (kcal, kJ) como azúcares
- NUNCA uses el total de hidratos de carbono como azúcares
- El valor de azúcares SIEMPRE es menor o igual al total de hidratos de carbono
- En refrescos sin azúcar (Coca-Cola Zero, etc.) el valor correcto de azúcares es 0 o muy cercano a 0
- Si el valor encontrado es mayor que 99 g/100g, es casi seguro que has leído calorías por error → devuelve null

CAMPOS A EXTRAER:
1. product_category: tipo de producto en 3-5 palabras (ej: "refresco cola sin azúcar", "yogur natural desnatado", "pasta integral seca")
2. sugar_g_per_100: gramos de AZÚCARES por 100g — solo la fila "de los cuales azúcares". Número decimal o null si no lo encuentras.
3. confidence: "high" si imagen nítida y valor encontrado con certeza, "medium" si dudas menores, "low" si imagen borrosa o ilegible.
4. raw_text_found: texto literal de la etiqueta para ese campo (ej: "de los cuales azúcares 0 g"), o "" si no lo encontraste.

Responde SOLO con este JSON sin ningún texto adicional:
{"product_category": "...", "sugar_g_per_100": número_o_null, "confidence": "high|medium|low", "raw_text_found": "..."}`

  const raw = await callMiMo(
    [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: cleanMime, data: cleanBase64 },
          },
          { type: 'text', text: userText },
        ],
      },
    ],
    system,
    2048
  )

  const parsed = safeParseJSON<VisionResult>(raw)
  if (!parsed) {
    return {
      product_category: 'producto desconocido',
      sugar_g_per_100: null,
      confidence: 'low',
      raw_text_found: '',
    }
  }
  return parsed
}

// ─── FASE 2 — Cargar alimentos permitidos en la dieta semanal ─────────
async function phaseLoadDiet(
  patientId: string,
  db: ReturnType<typeof createClient>
): Promise<{ allowedFoods: string[]; hasDiet: boolean }> {
  // Cargar planes activos del paciente (igual que nm-chat v16)
  const { data: plans, error } = await db
    .from('nm_diet_plans')
    .select('diet_type, diet_code, day_of_week')
    .eq('patient_id', patientId)
    .eq('is_active', true)

  if (error || !plans || plans.length === 0) {
    return { allowedFoods: [], hasDiet: false }
  }

  // Resolver diet_codes — mismo patrón que nm-chat v16 línea 234
  const uniqueWeekCodes = [
    ...new Set(
      plans
        .map((p: { diet_type: string; diet_code: string }) =>
          p.diet_code || DIET_CODE_MAP[p.diet_type || ''] || ''
        )
        .filter(Boolean)
    ),
  ] as string[]

  if (uniqueWeekCodes.length === 0) {
    return { allowedFoods: [], hasDiet: false }
  }

  // UNION de alimentos permitidos en cualquier día de la semana
  const { data: foods } = await db
    .from('nm_food_knowledge')
    .select('name, category')
    .overlaps('diet_codes', uniqueWeekCodes)

  const allowedFoods: string[] = (foods ?? [])
    .filter((f: { category: string }) => f.category !== 'restriccion')
    .map((f: { name: string }) => f.name)

  console.log(
    `[nm-scanner v1] patient=${patientId} codes=${uniqueWeekCodes.join(',')} foods=${allowedFoods.length}`
  )

  return { allowedFoods, hasDiet: true }
}

// ─── FASE 3 — Razonamiento dietético: ¿está el producto en la dieta? ──
async function phaseDietCheck(
  productCategory: string,
  allowedFoods: string[]
): Promise<DietResult> {
  if (allowedFoods.length === 0) {
    return { in_diet: false, matched_food: null }
  }

  const system = `Eres un clasificador nutricional preciso.
Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin markdown.`

  const foodList = allowedFoods.slice(0, 200).join(', ')

  const userText = `Producto escaneado: "${productCategory}"

Alimentos permitidos en la dieta del paciente esta semana:
${foodList}

¿El producto escaneado ES o PERTENECE a algún alimento de la lista?
Considera equivalencias semánticas (ejemplos: "yogur desnatado natural" ≡ "Yogur natural sin azúcar", "pasta integral seca" ≡ "Pasta integral", "filete de pechuga" ≡ "Pechuga de pollo").
Sé permisivo con las equivalencias — si el producto es claramente una versión del alimento permitido, marca in_diet: true.

Responde SOLO con este JSON:
{"in_diet": true_o_false, "matched_food": "nombre_del_alimento_coincidente_o_null"}`

  const raw = await callMiMo(
    [{ role: 'user', content: userText }],
    system,
    1024,
    MODEL_DIET
  )

  const parsed = safeParseJSON<DietResult>(raw)
  return parsed ?? { in_diet: false, matched_food: null }
}

// ─── FASE 4 — Veredicto final (TypeScript puro) ───────────────────────
function phaseVerdict(
  vision: VisionResult,
  diet: DietResult,
  hasDiet: boolean
): ScanResponse {
  const { sugar_g_per_100, confidence, product_category } = vision

  // Sin dieta asignada — no podemos evaluar el criterio 1
  if (!hasDiet) {
    return {
      allowed: null,
      reason: 'no_diet_assigned',
      sugar_g_per_100,
      threshold: SUGAR_THRESHOLD,
      product_category,
      matched_food: null,
      confidence,
    }
  }

  // Etiqueta ilegible — no podemos evaluar el criterio 2
  if (sugar_g_per_100 === null || confidence === 'low') {
    return {
      allowed: null,
      reason: 'unreadable',
      sugar_g_per_100,
      threshold: SUGAR_THRESHOLD,
      product_category,
      matched_food: diet.matched_food,
      confidence,
    }
  }

  const sugarOk = sugar_g_per_100 <= SUGAR_THRESHOLD
  const dietOk  = diet.in_diet === true

  let reason: Reason
  if (sugarOk && dietOk)   reason = 'approved'
  else if (!dietOk && !sugarOk) reason = 'both_fail'
  else if (!dietOk)         reason = 'not_in_diet'
  else                      reason = 'sugar_too_high'

  return {
    allowed: sugarOk && dietOk,
    reason,
    sugar_g_per_100,
    threshold: SUGAR_THRESHOLD,
    product_category,
    matched_food: diet.matched_food,
    confidence,
  }
}

// ─── Handler principal ─────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { image_base64, mime_type, patient_id } = await req.json()

    if (!image_base64 || !mime_type || !patient_id) {
      return new Response(
        JSON.stringify({ error: 'Faltan campos requeridos: image_base64, mime_type, patient_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const db = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // ── Fases en paralelo donde sea posible ───────────────────────────
    // Fase 1 (visión) y Fase 2 (dieta) se pueden lanzar en paralelo
    const [vision, { allowedFoods, hasDiet }] = await Promise.all([
      phaseVision(image_base64, mime_type),
      phaseLoadDiet(patient_id, db),
    ])

    console.log(
      `[nm-scanner v1] vision: category="${vision.product_category}" sugar=${vision.sugar_g_per_100} conf=${vision.confidence}`
    )

    // Fase 3 — razonamiento dietético (depende de fase 1 y 2)
    let dietResult: DietResult = { in_diet: false, matched_food: null }
    if (vision.confidence !== 'low' && hasDiet) {
      dietResult = await phaseDietCheck(vision.product_category, allowedFoods)
      console.log(
        `[nm-scanner v1] diet check: in_diet=${dietResult.in_diet} matched="${dietResult.matched_food}"`
      )
    }

    // Fase 4 — veredicto
    const response = phaseVerdict(vision, dietResult, hasDiet)
    console.log(`[nm-scanner v1] verdict: allowed=${response.allowed} reason=${response.reason}`)

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[nm-scanner v2.5] unexpected error:', err)
    return new Response(
      JSON.stringify({ error: 'Error interno del servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
