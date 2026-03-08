import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

// ═══════════════════════════════════════════════════════════════════════
// nm-scanner v1 — Análisis de etiquetas nutricionales
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

const MODEL_VISION = 'claude-3-haiku-20240307'
const MODEL_DIET   = 'claude-3-haiku-20240307'
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

// ─── Llamada a Anthropic API ───────────────────────────────────────────
async function callAnthropic(
  messages: object[],
  systemPrompt: string,
  maxTokens = 256
): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL_VISION,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic API error ${res.status}: ${err}`)
  }
  const data = await res.json()
  return data.content?.[0]?.text ?? ''
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
  const system = `Eres un experto en lectura de tablas nutricionales de etiquetas de productos alimentarios.
Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin markdown, sin explicaciones.`

  const userText = `Analiza esta etiqueta nutricional y extrae:
1. product_category: describe el tipo de producto en 3-5 palabras (ej: "yogur natural desnatado", "pasta integral", "galletas avena miel")
2. sugar_g_per_100: los gramos de AZÚCARES por 100g de producto. Encuéntralo en la tabla nutricional bajo "Hidratos de carbono / de los cuales azúcares" o "Carbohydrates / of which sugars" o "Glucides / dont sucres" o "Azúcares". Devuelve el número decimal (ej: 3.5) o null si no puedes leerlo.
3. confidence: "high" si la imagen es nítida y encontraste el valor, "medium" si hay dudas menores, "low" si la imagen es borrosa o ilegible.
4. raw_text_found: el texto literal tal como aparece en la etiqueta para el campo de azúcares (ej: "Azúcares 3,5 g"), o "" si no lo encontraste.

Responde SOLO con este JSON:
{"product_category": "...", "sugar_g_per_100": número_o_null, "confidence": "high|medium|low", "raw_text_found": "..."}`

  const raw = await callAnthropic(
    [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType, data: imageBase64 },
          },
          { type: 'text', text: userText },
        ],
      },
    ],
    system,
    300
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

  const raw = await callAnthropic(
    [{ role: 'user', content: userText }],
    system,
    150
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
    console.error('[nm-scanner v1] unexpected error:', err)
    return new Response(
      JSON.stringify({ error: 'Error interno del servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
