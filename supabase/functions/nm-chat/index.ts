import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

// ═══════════════════════════════════════════════════════════════════════
// nm-chat v13 — Template auto-fill server-side
// Fix: cuando nm_daily_meals vacío, genera plantilla desde nm_meal_catalog
//      + nm_breakfast_catalog igual que el frontend React
// ═══════════════════════════════════════════════════════════════════════

const MODEL_CLASSIFIER = 'claude-3-haiku-20240307'
const MODEL_FORMATTER  = 'claude-sonnet-4-5-20250929'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ─── MAPEOS DIET_CODE ──────────────────────────────────────────────────
// Misma lógica que dietConfig.js frontend — fuente de verdad compartida
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

const BREAKFAST_MAP: Record<string, string> = {
  'D01': 'Completo IG Intermedio', 'D02': 'Completo IG Bajo',
  'D03': 'Acelerado IG Bajo',     'D04': 'Acelerado IG Bajo',
  'D05': 'Completo IG Bajo',      'D06': 'Acelerado IG Bajo',
  'D07': 'Acelerado Rescate',     'D08': 'Acelerado Rescate',
  'D09': 'Acelerado Rescate',     'D10': 'Completo IG Intermedio',
}

const SNACK_MAP: Record<string, string> = {
  'D01': 'Fruta de temporada (manzana, pera, naranja, kiwi) / Yogur natural sin azúcar + frutos secos / Quesito + nueces',
  'D02': 'Fruta baja en IG (fresas, arándanos, kiwi, manzana) / Yogur natural sin azúcar + semillas chía / Aguacate con limón',
  'D03': 'Fruta: manzana, kiwi o frutos rojos / Yogur natural sin azúcar / Huevo duro + pepino',
  'D04': 'Aguacate + nueces / Queso curado + jamón serrano / Huevo duro + aceitunas',
  'D05': 'Frutos rojos (arándanos, frambuesas, fresas) / Yogur natural + semillas / Almendras crudas (20g)',
  'D06': 'Aguacate / Huevo duro / Queso fresco + pepino',
  'D07': 'Yogur natural sin azúcar / Kiwi o piña x2 / Huevo duro',
  'D08': 'Yogur natural sin azúcar / Huevo duro / Pepino + 3 nueces',
  'D09': 'Yogur natural sin azúcar / Huevo duro',
  'D10': 'Fruta integral (manzana, pera, naranja) / Yogur natural + chía / Almendras (20g) + fruta',
}

const DAYS_ORDER = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']

// ─── GENERADORES DE PLANTILLA (mirror de dietConfig.js) ───────────────
function buildBreakfastText(bf: Record<string, string>): string {
  const parts: string[] = []
  if (bf.drinks)   parts.push(`Bebidas: ${bf.drinks}`)
  if (bf.bread)    parts.push(`Pan: ${bf.bread}`)
  if (bf.toppings) parts.push(`Complementos tostada: ${bf.toppings}`)
  if (bf.dairy)    parts.push(`Lácteos: ${bf.dairy}`)
  if (bf.fruits)   parts.push(`Frutas: ${bf.fruits}`)
  if (bf.extras)   parts.push(`Opciones extra: ${bf.extras}`)
  return parts.join(' | ')
}

function buildLunchDinnerText(
  platos: Array<Record<string, string>>,
  offset = 0
): string {
  if (!platos || platos.length === 0) return 'Sin platos en catálogo para esta dieta'
  const rotated = [...platos.slice(offset), ...platos.slice(0, offset)]
  const options = rotated.slice(0, 4)
  return options.map((p, i) => {
    const label = ['A', 'B', 'C', 'D'][i]
    const ing = p.ingredients || ''
    return `Opción ${label}: ${p.name}${ing ? ' (' + ing + ')' : ''}`
  }).join(' / ')
}

// ─── INTENT DEFINITIONS ───────────────────────────────────────────────
const INTENT_DEFINITIONS = `
INTENCIONES VÁLIDAS (elige UNA):
- alimento_permitido: Pregunta si puede comer un alimento específico
- alimento_alternativa: Pide alternativas o sustitutos de alimentos
- dieta_info: Pregunta sobre su dieta asignada (qué es, cómo funciona)
- comida_sugerencia: Pide ideas o sugerencias para comidas/cenas/desayunos
- horario_comidas: Pregunta sobre cuándo comer, franjas horarias, frecuencia
- receta_consulta: Pide recetas o preparaciones específicas
- medicacion: Pregunta sobre medicación (no la prescribas, solo informa)
- peso_progreso: Pregunta sobre su progreso de peso, objetivos
- saludo: Saludo sin contenido nutricional
- despedida: Se despide o agradece
- otro: No encaja en nutrición/dietas
`

function buildClassifierPrompt(message: string, patientContext: string): string {
  return `Eres un clasificador de intenciones para un chatbot de nutrición clínica.

CONTEXTO PACIENTE:
${patientContext}

MENSAJE: "${message}"

${INTENT_DEFINITIONS}

Responde SOLO JSON válido, sin markdown, sin backticks:
{"intent":"...","entities":{"food":"...","meal_time":"..."},"confidence":"alta|media|baja"}`
}

// ─── FORMATTER SYSTEM PROMPT ──────────────────────────────────────────
const FORMATTER_SYSTEM = `Eres el asistente nutricional personal del paciente.

JERARQUÍA DE FUENTES (OBLIGATORIA — seguir en este orden):
1. MENÚ SEMANAL GUARDADO (etiquetado "MENÚ GUARDADO"): Datos personalizados por el dietista. Máxima prioridad.
2. PLANTILLA BASE DE DIETA (etiquetado "PLANTILLA BASE"): Generada automáticamente desde el catálogo de la dieta asignada. Usar cuando no hay menú guardado.
3. ALIMENTOS PERMITIDOS POR CÓDIGO DE DIETA: Referencia secundaria de frecuencia y preparación.
4. DESCRIPCIÓN DE DIETA: Para explicar en qué consiste su dieta si lo pregunta.
5. HISTORIAL DE PESO: Solo para preguntas de progreso.

REGLAS ABSOLUTAS:
1. Si hay PLANTILLA BASE, úsala como referencia de qué puede comer. NO digas "el doctor no ha configurado tu menú". La plantilla es la dieta real del paciente.
2. NUNCA uses conocimiento nutricional general externo. Solo los datos RAG.
3. NUNCA prescribas medicación ni dosis.
4. NUNCA diagnostiques ni prometas resultados.
5. Usa tono cercano, profesional y conciso (máximo 3 frases).
6. Si la pregunta es médica compleja di: "Eso mejor lo hablamos con el doctor en la próxima consulta."
7. Zero emojis. Texto natural, sin markdown, sin listas.
8. Responde SIEMPRE en español.
9. Preséntate como "tu asistente nutricional personal". Sin nombre propio.
10. SOLO di "no encuentro tu dieta" si NO hay ni menú guardado NI plantilla base en los datos RAG.`

// ─── ANTHROPIC API CALL ──────────────────────────────────────────────
async function callAnthropic(
  model: string,
  systemPrompt: string,
  messages: Array<{role: string, content: string}>,
  maxTokens = 500
): Promise<{text: string, usage: {input_tokens: number, output_tokens: number}}> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system: systemPrompt, messages }),
  })

  if (!response.ok) {
    const errBody = await response.text()
    console.error(`[Anthropic ${model}] HTTP ${response.status}: ${errBody}`)
    throw new Error(`Anthropic API error (${model}): ${response.status}`)
  }

  const data = await response.json()
  return {
    text:  data.content?.[0]?.text || '',
    usage: data.usage || { input_tokens: 0, output_tokens: 0 },
  }
}

// ─── CLASSIFY INTENT ─────────────────────────────────────────────────
async function classifyIntent(
  message: string,
  patientContext: string
): Promise<{intent: string, entities: Record<string, string>, confidence: string}> {
  const prompt = buildClassifierPrompt(message, patientContext)
  const result = await callAnthropic(
    MODEL_CLASSIFIER,
    'Eres un clasificador JSON. Responde SOLO JSON válido.',
    [{role: 'user', content: prompt}],
    150
  )
  try {
    let cleaned = result.text.trim()
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    }
    const parsed = JSON.parse(cleaned)
    return {
      intent:     parsed.intent     || 'otro',
      entities:   parsed.entities   || {},
      confidence: parsed.confidence || 'media',
    }
  } catch (_e) {
    console.error('[Classify] Parse error, raw:', result.text)
    return { intent: 'otro', entities: {}, confidence: 'baja' }
  }
}

// ─── RAG: FETCH RELEVANT DATA ─────────────────────────────────────────
async function fetchRAGContext(
  supabase: ReturnType<typeof createClient>,
  intent: string,
  entities: Record<string, string>,
  patientId: string
): Promise<string> {
  const ragParts: string[] = []

  // ═══════════════════════════════════════════════════════
  // BLOQUE 1 (SIEMPRE): Dietas asignadas
  // Fallback diet_code: si es NULL, resolver desde DIET_CODE_MAP
  // ═══════════════════════════════════════════════════════
  const { data: dietPlans } = await supabase
    .from('nm_diet_plans')
    .select('diet_type, diet_name, diet_code, day_of_week, notes')
    .eq('patient_id', patientId)
    .eq('is_active', true)

  // Resolver diet_code con fallback al mapa de slugs
  const resolvedPlans = (dietPlans || []).map(d => ({
    ...d,
    resolved_code: d.diet_code || DIET_CODE_MAP[d.diet_type || ''] || '',
  }))

  const uniqueDietCodes = [...new Set(
    resolvedPlans.map(d => d.resolved_code).filter(Boolean)
  )]

  if (resolvedPlans.length > 0) {
    ragParts.push(
      `DIETA ASIGNADA AL PACIENTE:\n` +
      resolvedPlans.map(d =>
        `- ${d.day_of_week}: ${d.diet_name || d.diet_type} (código: ${d.resolved_code || 'N/A'})`
      ).join('\n')
    )
  } else {
    ragParts.push('DIETA ASIGNADA: Sin dieta activa registrada.')
  }

  // ═══════════════════════════════════════════════════════
  // BLOQUE 2: Menú semanal
  // v13 FIX: si nm_daily_meals vacío → generar plantilla desde catálogos
  // ═══════════════════════════════════════════════════════
  const { data: daily } = await supabase
    .from('nm_daily_meals')
    .select('day_of_week, breakfast, lunch, dinner, snack_morning, snack_afternoon, notes')
    .eq('patient_id', patientId)
    .eq('is_active', true)
    .order('day_of_week')

  // Filtrar solo días con contenido real
  const realMeals = (daily || []).filter(m =>
    m.breakfast || m.lunch || m.dinner
  )

  if (realMeals.length > 0) {
    // ── Caso A: hay menús guardados por el dietista ──
    const menuLines = realMeals.map(m => {
      const parts = [`DÍA: ${m.day_of_week.toUpperCase()}`]
      if (m.breakfast)       parts.push(`  DESAYUNO: ${m.breakfast}`)
      if (m.snack_morning)   parts.push(`  MEDIA MAÑANA: ${m.snack_morning}`)
      if (m.lunch)           parts.push(`  COMIDA: ${m.lunch}`)
      if (m.snack_afternoon) parts.push(`  MERIENDA: ${m.snack_afternoon}`)
      if (m.dinner)          parts.push(`  CENA: ${m.dinner}`)
      return parts.join('\n')
    })
    ragParts.push(
      `\nMENÚ GUARDADO (personalizado por el dietista — máxima prioridad):\n` +
      menuLines.join('\n\n')
    )
  } else if (uniqueDietCodes.length > 0) {
    // ── Caso B: nm_daily_meals vacío → generar plantilla desde catálogos ──
    console.log(`[v13] nm_daily_meals vacío → generando plantilla para códigos: ${uniqueDietCodes.join(', ')}`)

    // Cargar catálogos en paralelo
    const [mealCatRes, bfCatRes] = await Promise.all([
      supabase
        .from('nm_meal_catalog')
        .select('name, ingredients, diet_codes, meal_time')
        .overlaps('diet_codes', uniqueDietCodes)
        .order('name'),
      supabase
        .from('nm_breakfast_catalog')
        .select('name, drinks, bread, toppings, dairy, fruits, extras'),
    ])

    const mealCatalog   = mealCatRes.data || []
    const bfCatalog     = bfCatRes.data   || []

    // Generar plantilla por cada día
    const templateLines: string[] = []

    DAYS_ORDER.forEach(day => {
      // Encontrar el plan para este día (override específico o 'todos')
      const plan =
        resolvedPlans.find(p => p.day_of_week === day) ||
        resolvedPlans.find(p => p.day_of_week === 'todos')
      if (!plan) return

      const code = plan.resolved_code
      if (!code) return

      // Desayuno desde nm_breakfast_catalog
      const bfName = BREAKFAST_MAP[code]
      const bfRow  = bfCatalog.find(b => b.name === bfName) as Record<string, string> | undefined
      const breakfastText = bfRow ? buildBreakfastText(bfRow) : 'Ver opciones de desayuno con el dietista'

      // Comida/Cena desde nm_meal_catalog
      const platos = mealCatalog.filter(m =>
        Array.isArray(m.diet_codes) && m.diet_codes.includes(code)
      ) as Array<Record<string, string>>
      const half   = Math.ceil(platos.length / 2)
      const lunchText  = buildLunchDinnerText(platos, 0)
      const dinnerText = buildLunchDinnerText(platos, half)

      // Snack
      const snackText = SNACK_MAP[code] || 'Fruta de temporada / Yogur natural'

      templateLines.push(
        `DÍA: ${day.toUpperCase()} (dieta: ${plan.diet_name || plan.diet_type})\n` +
        `  DESAYUNO: ${breakfastText}\n` +
        `  MEDIA MAÑANA: ${snackText}\n` +
        `  COMIDA: ${lunchText}\n` +
        `  MERIENDA: ${snackText}\n` +
        `  CENA: ${dinnerText}`
      )
    })

    if (templateLines.length > 0) {
      ragParts.push(
        `\nPLANTILLA BASE DE DIETA (generada del catálogo — úsala para responder qué puede comer):\n` +
        templateLines.join('\n\n')
      )
    }
  } else {
    ragParts.push('\nMENÚ SEMANAL: Sin dieta activa asignada al paciente.')
  }

  // ═══════════════════════════════════════════════════════
  // BLOQUE 3 (SIEMPRE): Descripción de dietas del catálogo
  // ═══════════════════════════════════════════════════════
  if (uniqueDietCodes.length > 0) {
    const { data: dietCatalog } = await supabase
      .from('nm_diet_catalog')
      .select('diet_code, name, description, restriction_level, glycemic_index')
      .in('diet_code', uniqueDietCodes)
    if (dietCatalog && dietCatalog.length > 0) {
      ragParts.push(
        `\nDESCRIPCIÓN DE LAS DIETAS ASIGNADAS:\n` +
        dietCatalog.map(d =>
          `${d.name} (${d.diet_code}): ${d.description || 'Sin descripción'} | Restricción: ${d.restriction_level || 'N/A'}`
        ).join('\n')
      )
    }
  }

  // ═══════════════════════════════════════════════════════
  // BLOQUE 4 (intent-específico): RAG adicional por tipo
  // ═══════════════════════════════════════════════════════
  switch (intent) {
    case 'alimento_permitido':
    case 'alimento_alternativa': {
      const foodName = entities.food || ''

      if (foodName) {
        const { data: specificFood } = await supabase
          .from('nm_food_knowledge')
          .select('name, category, subcategory, details, diet_codes')
          .ilike('name', `%${foodName}%`)
          .limit(10)

        if (specificFood && specificFood.length > 0) {
          const relevant = uniqueDietCodes.length > 0
            ? specificFood.filter(f =>
                !f.diet_codes || f.diet_codes.length === 0 ||
                f.diet_codes.some((code: string) => uniqueDietCodes.includes(code))
              )
            : specificFood

          if (relevant.length > 0) {
            ragParts.push(
              `\nALIMENTO "${foodName}" EN BASE DE CONOCIMIENTO:\n` +
              relevant.map(f => {
                const det = typeof f.details === 'string' ? f.details : JSON.stringify(f.details || {})
                return `- ${f.name} [${f.category}] dietas permitidas: ${(f.diet_codes || []).join(', ')} | ${det.substring(0, 200)}`
              }).join('\n')
            )
          } else {
            ragParts.push(`\nALIMENTO "${foodName}": encontrado en BD pero no aplica a las dietas del paciente (${uniqueDietCodes.join(', ')}).`)
          }
        } else {
          ragParts.push(`\nALIMENTO "${foodName}": No encontrado en la base de conocimiento de alimentos.`)
        }
      }

      if (uniqueDietCodes.length > 0) {
        const { data: allowedFoods } = await supabase
          .from('nm_food_knowledge')
          .select('name, category, diet_codes')
          .overlaps('diet_codes', uniqueDietCodes)
          .limit(60)
        if (allowedFoods && allowedFoods.length > 0) {
          ragParts.push(
            `\nALIMENTOS PERMITIDOS PARA SUS DIETAS (${uniqueDietCodes.join(', ')}) — ${allowedFoods.length} registros:\n` +
            allowedFoods.map(f => `${f.name} [${f.category}]`).join(', ')
          )
        }
      }
      break
    }

    case 'comida_sugerencia':
    case 'receta_consulta': {
      const mealTime = entities.meal_time || ''
      if (uniqueDietCodes.length > 0) {
        let mealQ = supabase
          .from('nm_meal_catalog')
          .select('name, meal_time, ingredients, protein_type, diet_codes, plate_code')
          .overlaps('diet_codes', uniqueDietCodes)
        if (mealTime) mealQ = mealQ.eq('meal_time', mealTime)
        const { data: meals } = await mealQ.limit(15)
        if (meals && meals.length > 0) {
          ragParts.push(
            `\nSUGERENCIAS DEL CATÁLOGO PARA SUS DIETAS:\n` +
            meals.map(m => `- ${m.name} [${m.meal_time}]: ${m.ingredients || ''}`).join('\n')
          )
        }
      }
      const { data: breakfasts } = await supabase
        .from('nm_breakfast_catalog')
        .select('name, drinks, bread, toppings, dairy, fruits, extras')
        .limit(8)
      if (breakfasts && breakfasts.length > 0) {
        ragParts.push(
          `\nOPCIONES DE DESAYUNO:\n` +
          breakfasts.map(b =>
            `- ${b.name}: ${[b.drinks, b.bread, b.dairy, b.fruits].filter(Boolean).join(' | ')}`
          ).join('\n')
        )
      }
      if (uniqueDietCodes.length > 0) {
        const { data: snacks } = await supabase
          .from('nm_snack_catalog')
          .select('name, fruits, dairy, nuts, diet_codes')
          .overlaps('diet_codes', uniqueDietCodes)
          .limit(8)
        if (snacks && snacks.length > 0) {
          ragParts.push(
            `\nOPCIONES DE MERIENDA:\n` +
            snacks.map(s => `- ${s.name}: ${[s.fruits, s.dairy, s.nuts].filter(Boolean).join(' | ')}`).join('\n')
          )
        }
      }
      break
    }

    case 'medicacion': {
      const { data: meds } = await supabase
        .from('nm_medications')
        .select('medication_name, dosage, frequency, side_effects, side_effects_treatment')
        .eq('patient_id', patientId)
        .eq('is_active', true)
      if (meds && meds.length > 0) {
        ragParts.push(
          `\nMEDICACIÓN ACTIVA (SOLO INFORMAR, NUNCA MODIFICAR):\n` +
          meds.map(m => `- ${m.medication_name}: ${m.dosage || ''} | ${m.frequency || ''}`).join('\n')
        )
      } else {
        ragParts.push('\nMEDICACIÓN: Sin medicación activa registrada.')
      }
      break
    }

    case 'peso_progreso': {
      const { data: weights } = await supabase
        .from('nm_weight_records')
        .select('weight, date, notes')
        .eq('patient_id', patientId)
        .order('date', { ascending: false })
        .limit(10)
      const { data: pat } = await supabase
        .from('nm_patients')
        .select('current_weight, initial_weight, target_weight, height')
        .eq('id', patientId)
        .single()
      if (pat) {
        ragParts.push(
          `\nDATOS DE PESO: Actual ${pat.current_weight}kg | Inicial ${pat.initial_weight}kg | Objetivo ${pat.target_weight}kg | Altura ${pat.height}cm`
        )
      }
      if (weights && weights.length > 0) {
        ragParts.push(
          `\nHISTORIAL DE PESO:\n` +
          weights.map(w => `- ${w.date}: ${w.weight}kg${w.notes ? ' | ' + w.notes : ''}`).join('\n')
        )
      }
      break
    }

    default:
      break
  }

  return ragParts.join('\n\n') || 'Sin datos RAG disponibles.'
}

// ═══ MAIN HANDLER ═══════════════════════════════════════════════════
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const startTime   = Date.now()
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase    = createClient(supabaseUrl, supabaseKey)

  try {
    const body = await req.json()

    let userMessage: string
    let patientId:   string
    let conversationId: string | null = body.conversation_id || null
    const isDirectCall = Boolean(body.message && body.patient_id)

    if (isDirectCall) {
      userMessage = body.message
      patientId   = body.patient_id
    } else if (body.messages && body.patient_context?.patient_id) {
      const msgs = body.messages as Array<{role: string, content: string}>
      const lastUserMsg = [...msgs].reverse().find(m => m.role === 'user')
      userMessage = lastUserMsg?.content || ''
      patientId   = body.patient_context.patient_id
    } else {
      return new Response(
        JSON.stringify({ error: 'Se requiere {message, patient_id} o {messages, patient_context}' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!userMessage || !patientId) {
      return new Response(
        JSON.stringify({ error: 'message y patient_id obligatorios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!conversationId) {
      const { data: activeConv } = await supabase
        .from('nm_chat_conversations')
        .select('id').eq('patient_id', patientId).eq('is_active', true)
        .order('updated_at', { ascending: false }).limit(1).single()
      if (activeConv) {
        conversationId = activeConv.id
      } else {
        const { data: newConv } = await supabase
          .from('nm_chat_conversations')
          .insert({ patient_id: patientId, title: userMessage.substring(0, 60), is_active: true })
          .select('id').single()
        conversationId = newConv?.id || null
      }
    }

    const { data: patient } = await supabase
      .from('nm_patients')
      .select('full_name, current_weight, target_weight, initial_weight, height, age')
      .eq('id', patientId).single()

    const patientContext = patient
      ? `Nombre: ${patient.full_name || 'Paciente'} | Peso: ${patient.current_weight || '?'}kg | Objetivo: ${patient.target_weight || '?'}kg | Altura: ${patient.height || '?'}cm | Edad: ${patient.age || '?'}`
      : 'Paciente sin datos'

    const { data: history } = await supabase
      .from('nm_chat_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false }).limit(6)

    const chatHistory = (history || []).reverse().map(m => ({
      role:    m.role as 'user' | 'assistant',
      content: m.content,
    }))

    if (isDirectCall) {
      await supabase.from('nm_chat_messages').insert({
        conversation_id: conversationId,
        role:    'user',
        content: userMessage,
      })
    }

    // FASE 1: Clasificar
    const classifyStart = Date.now()
    const classification = await classifyIntent(userMessage, patientContext)
    const classifyTime   = Date.now() - classifyStart
    console.log(`[v13 Phase1] intent=${classification.intent} conf=${classification.confidence} (${classifyTime}ms)`)

    // FASE 2: RAG (con template auto-fill cuando nm_daily_meals vacío)
    const ragStart   = Date.now()
    const ragContext = await fetchRAGContext(supabase, classification.intent, classification.entities, patientId)
    const ragTime    = Date.now() - ragStart
    console.log(`[v13 Phase2] RAG ${ragContext.length} chars (${ragTime}ms)`)

    // FASE 3: Formatear
    const formatStart = Date.now()
    const formatterMessages = [
      ...chatHistory,
      {
        role: 'user' as const,
        content:
          `[CONTEXTO PACIENTE: ${patientContext}]\n` +
          `[INTENCIÓN DETECTADA: ${classification.intent}]\n` +
          `[DATOS RAG — úsalos como única fuente de verdad]:\n${ragContext}\n\n` +
          `[MENSAJE DEL PACIENTE]: ${userMessage}`,
      }
    ]

    const formatResult      = await callAnthropic(MODEL_FORMATTER, FORMATTER_SYSTEM, formatterMessages, 600)
    const formattedResponse = formatResult.text || 'Lo siento, no he podido procesar tu consulta.'
    const formatTime        = Date.now() - formatStart
    const totalTime         = Date.now() - startTime
    console.log(`[v13 Phase3] format ${formatTime}ms | total ${totalTime}ms`)

    if (isDirectCall && conversationId) {
      await supabase.from('nm_chat_messages').insert({
        conversation_id: conversationId,
        role:    'assistant',
        content: formattedResponse,
        metadata: {
          intent:     classification.intent,
          confidence: classification.confidence,
          entities:   classification.entities,
          models:     { classifier: MODEL_CLASSIFIER, formatter: MODEL_FORMATTER },
          timing:     { classify_ms: classifyTime, rag_ms: ragTime, format_ms: formatTime, total_ms: totalTime },
          rag_length: ragContext.length,
          version:    'v13',
        }
      })
    }

    if (conversationId) {
      await supabase.from('nm_chat_conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId)
    }

    return new Response(
      JSON.stringify({
        content:         formattedResponse,
        message:         formattedResponse,
        response:        formattedResponse,
        conversation_id: conversationId,
        classification: {
          intent:     classification.intent,
          confidence: classification.confidence,
          entities:   classification.entities,
        },
        timing: { classify_ms: classifyTime, rag_ms: ragTime, format_ms: formatTime, total_ms: totalTime },
        models: { classifier: MODEL_CLASSIFIER, formatter: MODEL_FORMATTER },
        version: 'v13',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[nm-chat v13] Fatal:', error)
    return new Response(
      JSON.stringify({
        content: 'Lo siento, ha habido un error. Inténtalo de nuevo.',
        message: 'Lo siento, ha habido un error. Inténtalo de nuevo.',
        error:   String(error),
        timing:  { total_ms: Date.now() - startTime },
        version: 'v13',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
