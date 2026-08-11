import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { DIET_CODE_MAP } from '../_shared/dietCodes.ts'

// ═══════════════════════════════════════════════════════════════════════
// nm-scanner v3.0 — Migración MiMo → Gemini (visión) + DeepSeek (texto) (2026-08-11)
//   Xiaomi revocó la MIMO_API_KEY por TERCERA vez (401 Invalid API Key).
//   Historial MiMo: key revocada (mayo) → modelos retirados (julio) → key
//   revocada de nuevo (agosto). Se abandona MiMo definitivamente.
//
//   Nueva arquitectura de proveedores:
//   - FASE 1 VISIÓN → gemini-2.5-flash. La API oficial de DeepSeek NO acepta
//     imágenes (bloques 'image' = "Not Supported" en su endpoint
//     Anthropic-compat, api-docs.deepseek.com/guides/anthropic_api), así que
//     la única fase que necesita ojos usa Gemini. JSON puro forzado vía
//     responseMimeType + thinking desactivado (thinkingBudget: 0).
//   - FASE 3 DIETÉTICO (solo texto) → deepseek-v4-flash vía endpoint
//     Anthropic-compat (https://api.deepseek.com/anthropic/v1/messages):
//     mismo wire format que usaba MiMo — solo cambia URL + secret + modelo.
//     thinking:{type:'disabled'} obligatorio: deepseek-v4 razona por defecto
//     y el thinking consume max_tokens antes de emitir texto (verificado).
//
//   Secrets nuevos en Vault: DEEPSEEK_API_KEY + GEMINI_API_KEY.
//   MIMO_API_KEY queda obsoleto. CERO cambios de contrato con el frontend.
//
// nm-scanner v2.7 — Migrate retired mimo-v2-omni → mimo-v2.5 multimodal (2026-07-07)
//   MiMo retiró mimo-v2-omni (HTTP 400 'Unsupported model') — el escáner
//   llevaba caído en producción desde el retiro. /v1/models confirma catálogo
//   v2.5-only; verificado que mimo-v2.5 procesa imágenes (visión) correctamente.
//
// nm-scanner v2.6 — Productos neutros: triple capa de defensa (2026-05-14)
//   Bug: productos como sacarina/sal/especias/café sin azúcar resultaban
//   "no autorizado en tu dieta" porque no estaban en nm_food_knowledge
//   con diet_codes matching, aunque son universalmente compatibles.
//
//   Fix en 3 capas:
//   A) BD: 17 nuevos rows en nm_food_knowledge con categorías 'edulcorante',
//      'condimento' y bebidas neutras, todas con diet_codes D01-D10.
//   B) Lógica: nuevo predicado isNeutralCategory() basado en regex aplicado
//      en phaseVerdict. Si la categoría detectada por visión es neutra,
//      bypass del criterio dieta; solo aplica umbral de azúcares.
//   C) Prompt: phaseDietCheck instruido para devolver in_diet:true cuando
//      el producto encaje en categorías neutras aunque no esté en la lista.
//
// nm-scanner v2.5 — Defensive sanitization for vision payload
//   Strip data URI prefix + normalize image/jpg → image/jpeg.
//
// nm-scanner v2.4 — Migrate retired model mimo-v2-pro → mimo-v2.5
//
// nm-scanner v2.3 — Rotate revoked MiMo API key fallback
//   RESUELTO 2026-07-07: fallback eliminado — MIMO_API_KEY
//   se lee exclusivamente del Vault de secrets (error explícito si falta).
//
// nm-scanner v2.2 — Fix max_tokens for MiMo thinking blocks
//
// Pipeline de 4 fases:
//   1. VISIÓN      — gemini-2.5-flash (multimodal) extrae azúcares/100g y categoría del producto
//   2. DIETA       — Supabase carga alimentos permitidos (UNION semana)
//   3. DIETÉTICO   — deepseek-v4-flash decide si el producto está en la dieta
//   4. VEREDICTO   — TypeScript aplica doble criterio (dieta + umbral 4g)
//                    + bypass para categorías neutras (v2.6)
//
// Contratos:
//   - verify_jwt: false (llamada directa desde frontend autenticado)
//   - CERO cambios de schema — usa nm_diet_plans + nm_food_knowledge existentes
//   - Stateless — no persiste resultados en BD
//   - DIET_CODE_MAP compartido via ../_shared/dietCodes.ts (sincronizado con frontend)
// ═══════════════════════════════════════════════════════════════════════

const MODEL_VISION = 'gemini-2.5-flash'
const MODEL_DIET   = 'deepseek-v4-flash'
const SUGAR_THRESHOLD = 4.0

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

// ─── Llamada a DeepSeek (texto, endpoint compatible con formato Anthropic) ──
// thinking:{type:'disabled'} es OBLIGATORIO: deepseek-v4 razona por defecto
// y los bloques thinking consumen max_tokens antes de emitir texto
// (verificado en vivo 2026-08-11: sin desactivarlo, content llega SIN
// bloque 'text' y stop_reason='max_tokens').
async function callDeepSeek(
  messages: object[],
  systemPrompt: string,
  maxTokens = 256,
  model = MODEL_DIET
): Promise<string> {
  const apiKey = Deno.env.get('DEEPSEEK_API_KEY') ?? ''
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY secret no configurado en Supabase Vault')
  const res = await fetch('https://api.deepseek.com/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      thinking: { type: 'disabled' },
      system: systemPrompt,
      messages,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`DeepSeek API error ${res.status}: ${err}`)
  }
  const data = await res.json()
  const textBlock = (data.content || []).find((b: {type:string}) => b.type === 'text')
  return textBlock?.text ?? data.content?.[0]?.text ?? ''
}

// ─── Llamada a Gemini (visión) ─────────────────────────────────────────
// La API oficial de DeepSeek no acepta imágenes, así que la fase de visión
// usa gemini-2.5-flash. responseMimeType fuerza JSON puro (sin fences
// markdown) y thinkingConfig.thinkingBudget: 0 desactiva el razonamiento
// interno de los modelos 2.5 (latencia y coste). Shape del request/response
// verificado en vivo el 2026-08-11 contra v1beta/generateContent.
interface GeminiPart { text?: string }
interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] }
    finishReason?: string
  }>
  promptFeedback?: { blockReason?: string }
}

async function callGeminiVision(
  imageBase64: string,
  mimeType: string,
  systemPrompt: string,
  userText: string,
  maxTokens = 1024
): Promise<string> {
  const apiKey = Deno.env.get('GEMINI_API_KEY') ?? ''
  if (!apiKey) throw new Error('GEMINI_API_KEY secret no configurado en Supabase Vault')
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_VISION}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [
          {
            role: 'user',
            parts: [
              { inline_data: { mime_type: mimeType, data: imageBase64 } },
              { text: userText },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: maxTokens,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    }
  )
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini API error ${res.status}: ${err}`)
  }
  const data = (await res.json()) as GeminiResponse
  const candidate = data.candidates?.[0]
  if (!candidate?.content?.parts?.length) {
    throw new Error(
      `Gemini sin contenido: finishReason=${candidate?.finishReason ?? 'n/a'} block=${data.promptFeedback?.blockReason ?? 'n/a'}`
    )
  }
  return candidate.content.parts.map((p) => p.text ?? '').join('')
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
  // ── Defensive sanitization (v2.5 fix, sigue aplicando con Gemini) ────
  // Frontend may send base64 with data URI prefix ("data:image/jpeg;base64,XXX")
  // or with non-canonical mime ("image/jpg" instead of "image/jpeg"). Gemini
  // inline_data también exige base64 crudo y un mime canónico, así que la
  // sanitización se conserva tal cual tras la migración desde MiMo.
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

  const raw = await callGeminiVision(cleanBase64, cleanMime, system, userText, 1024)

  const parsed = safeParseJSON<VisionResult>(raw)
  if (!parsed) {
    return {
      product_category: 'producto desconocido',
      sugar_g_per_100: null,
      confidence: 'low',
      raw_text_found: '',
    }
  }
  // Normalización defensiva: en modo JSON estricto Gemini puede emitir null
  // en campos que no encuentra (verificado con imagen ilegible). Se fuerzan
  // los tipos del contrato VisionResult para las fases posteriores.
  return {
    product_category: parsed.product_category ?? 'producto desconocido',
    sugar_g_per_100: typeof parsed.sugar_g_per_100 === 'number' ? parsed.sugar_g_per_100 : null,
    confidence: parsed.confidence ?? 'low',
    raw_text_found: parsed.raw_text_found ?? '',
  }
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

NOTA IMPORTANTE — Productos sin valor nutricional significativo:
Los siguientes productos son SIEMPRE compatibles con cualquier dieta y deben marcarse SIEMPRE como in_diet: true, incluso si su nombre exacto NO aparece en la lista de alimentos permitidos:
- Edulcorantes sin azúcar: sacarina, estevia/stevia, eritritol, sucralosa, aspartamo, ciclamato, xilitol y cualquier "edulcorante" o "endulzante" sin azúcar
- Sal y sales: sal alimentaria, sal común, sal del Himalaya, sal marina, sal yodada, flor de sal
- Especias y condimentos: pimienta (cualquier color), pimentón, comino, curry, cúrcuma, jengibre seco, canela, clavo, anís, nuez moscada, laurel, azafrán
- Hierbas aromáticas: orégano, perejil, albahaca, tomillo, romero, cilantro, menta, eneldo, hierbabuena, salvia, estragón
- Vinagres: de vino, de manzana, balsámico, de arroz, de jerez
- Otros condimentos: mostaza sin azúcar añadido, salsa de soja sin azúcar, tabasco, salsa picante sin azúcar
- Cítricos puros: zumo de limón natural, zumo de lima, ralladura
- Bebidas neutras: agua (mineral, con gas, del grifo), café sin azúcar (negro, soluble, descafeinado, con leche sin azúcar), té sin azúcar (verde, rojo, negro), infusiones sin azúcar (manzanilla, poleo, rooibos, hierba luisa)

Si el producto escaneado encaja en cualquiera de estas categorías neutras, in_diet: true es OBLIGATORIO aunque no esté en la lista.

Responde SOLO con este JSON:
{"in_diet": true_o_false, "matched_food": "nombre_del_alimento_coincidente_o_null"}`

  const raw = await callDeepSeek(
    [{ role: 'user', content: userText }],
    system,
    1024,
    MODEL_DIET
  )

  const parsed = safeParseJSON<DietResult>(raw)
  return parsed ?? { in_diet: false, matched_food: null }
}

// ─── Detector de categorías neutras (defensa de capa B) ───────────────
// Productos sin valor nutricional significativo: edulcorantes, sales, especias,
// vinagres, mostaza sin azúcar, café/té/infusiones sin azúcar, agua.
// Si la categoría detectada por visión matchea, se bypasea el criterio de dieta
// y solo se aplica el umbral de azúcares.
//
// La detección es en 2 fases:
//   1) Palabra clave principal de un producto neutro
//   2) Si la palabra es ambigua (té, café, mostaza, salsa), exigir "sin azúcar" cerca
const NEUTRAL_STRONG_RX = /\b(edulcorante|edulcorantes|endulzante|sacarina|estevia|stevia|eritritol|sucralosa|aspartamo|ciclamato|xilitol|sal\s+(alimentaria|com[uú]n|del?\s+himalaya|marina|yodada|de\s+mesa)|pimienta|piment[oó]n|comino|curry|c[uú]rcuma|jengibre\s+(seco|en\s+polvo)|canela|clavo|an[ií]s|nuez\s+moscada|laurel|azafr[aá]n|or[ée]gano|perejil|albahaca|tomillo|romero|cilantro|menta|eneldo|hierbabuena|salvia|estrag[oó]n|hierba[s]?\s+aromática[s]?|especia[s]?|condimento[s]?|vinagre|tabasco|zumo\s+de\s+lim[oó]n|ralladura\s+de\s+lim[oó]n|infusi[oó]n|infusiones|manzanilla|poleo|rooibos|hierba\s+luisa|agua(\s+(mineral|con\s+gas|del\s+grifo))?)\b/i

// Compounds que requieren "sin azúcar" cerca para evitar falsos positivos
const NEUTRAL_COMPOUND_TERMS = /\b(t[eé]|caf[eé]|mostaza|salsa\s+de\s+soja|salsa\s+picante|lim[oó]n)\b/i
const SIN_AZUCAR_RX = /\bsin\s+az[uú]car(\s+a[ñn]adido)?\b/i

function isNeutralCategory(productCategory: string): boolean {
  if (!productCategory) return false
  const cat = productCategory.toLowerCase()
  // Strong match: la palabra sola ya es claramente neutra
  if (NEUTRAL_STRONG_RX.test(cat)) return true
  // Compound: solo si "sin azúcar" aparece en algún punto de la categoría
  if (NEUTRAL_COMPOUND_TERMS.test(cat) && SIN_AZUCAR_RX.test(cat)) return true
  return false
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

  // ── Capa B: bypass de criterio dieta para productos neutros ────────
  // Si visión detectó una categoría sin valor nutricional significativo
  // (edulcorante, sal, especias, vinagre, café sin azúcar, etc.), se
  // aprueba SOLO con el criterio de azúcares. Cubre el caso en que el
  // producto no aparezca en nm_food_knowledge pero la categoría sea
  // claramente neutra (3a línea de defensa tras BD y prompt).
  const isNeutral = isNeutralCategory(product_category)
  if (isNeutral) {
    return {
      allowed: sugarOk,
      reason: sugarOk ? 'approved' : 'sugar_too_high',
      sugar_g_per_100,
      threshold: SUGAR_THRESHOLD,
      product_category,
      matched_food: diet.matched_food || product_category,
      confidence,
    }
  }

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
    console.error('[nm-scanner v3.0] unexpected error:', err)
    return new Response(
      JSON.stringify({ error: 'Error interno del servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
