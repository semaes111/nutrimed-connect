import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

// ═══════════════════════════════════════════════════════════════════════
// nm-chat v11 — Hybrid Haiku/Sonnet Clinical Nutrition Chatbot
// Architecture: Haiku classify → RAG fetch → Sonnet format
// Frontend-compatible: accepts both direct and PatientChat.jsx formats
// ═══════════════════════════════════════════════════════════════════════

const MODEL_CLASSIFIER = 'claude-3-haiku-20240307'
const MODEL_FORMATTER = 'claude-sonnet-4-5-20250929'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ─── INTENT DEFINITIONS ──────────────────────────────────────────────
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

// ─── FORMATTER SYSTEM PROMPT ─────────────────────────────────────────
const FORMATTER_SYSTEM = `Eres el asistente nutricional personal del paciente.

REGLAS ABSOLUTAS:
1. SOLO responde basándote en los DATOS RAG proporcionados. Si un alimento NO aparece en los datos, di que no está en la lista de alimentos permitidos de su dieta.
2. NUNCA prescribas medicación ni dosis.
3. NUNCA diagnostiques ni prometas resultados.
4. Usa tono cercano, profesional y breve (2-3 frases máximo).
5. Si la pregunta excede tu capacidad, di: "Eso mejor lo hablamos con el doctor en la próxima consulta."
6. No uses emojis excesivos. Máximo 1 por mensaje si es necesario.
7. Si preguntan por un alimento, busca EXACTAMENTE en los datos RAG. Si no está, NO lo apruebes.
8. Las frutas de alto índice glucémico (sandía, melón, piña, plátano maduro, higos, uvas, mango) están RESTRINGIDAS en dietas restrictivas.
9. Responde SIEMPRE en español.
10. NO uses markdown, bullets ni listas formateadas. Texto natural.
11. Preséntate simplemente como "tu asistente nutricional personal". Sin nombre propio. Sin mencionar el nombre de la clínica ni del doctor.`

// ─── ANTHROPIC API CALL ──────────────────────────────────────────────
async function callAnthropic(
  model: string,
  systemPrompt: string,
  messages: Array<{role: string, content: string}>,
  maxTokens: number = 500
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
    text: data.content?.[0]?.text || '',
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
      intent: parsed.intent || 'otro',
      entities: parsed.entities || {},
      confidence: parsed.confidence || 'media',
    }
  } catch (_e) {
    console.error('[Classify] Parse error, raw:', result.text)
    return { intent: 'otro', entities: {}, confidence: 'baja' }
  }
}

// ─── RAG: FETCH RELEVANT DATA ───────────────────────────────────────
async function fetchRAGContext(
  supabase: ReturnType<typeof createClient>,
  intent: string,
  entities: Record<string, string>,
  patientId: string
): Promise<string> {
  const ragParts: string[] = []

  // Always load diet plans
  const { data: dietPlans } = await supabase
    .from('nm_diet_plans')
    .select('diet_type, diet_name, day_of_week, notes')
    .eq('patient_id', patientId)
    .eq('is_active', true)

  const dietCodes = dietPlans?.map(d => d.diet_type).filter(Boolean) || []
  const uniqueDietCodes = [...new Set(dietCodes)]

  if (dietPlans && dietPlans.length > 0) {
    ragParts.push(`DIETAS ASIGNADAS:\n${dietPlans.map(d => `- ${d.day_of_week}: ${d.diet_name} (${d.diet_type})`).join('\n')}`)
  }

  if (uniqueDietCodes.length > 0) {
    const { data: dietCatalog } = await supabase
      .from('nm_diet_catalog')
      .select('diet_code, name, description, restriction_level, glycemic_index')
      .in('diet_code', uniqueDietCodes)
    if (dietCatalog && dietCatalog.length > 0) {
      ragParts.push(`\nDESCRIPCIÓN DIETAS:\n${dietCatalog.map(d => `${d.name} (${d.diet_code}): ${d.description || ''} | Restricción: ${d.restriction_level || 'N/A'}`).join('\n')}`)
    }
  }

  // Intent-specific RAG
  switch (intent) {
    case 'alimento_permitido':
    case 'alimento_alternativa': {
      const foodName = entities.food || ''
      let foodQuery = supabase.from('nm_food_knowledge').select('name, category, subcategory, details, diet_codes')
      if (foodName) foodQuery = foodQuery.ilike('name', `%${foodName}%`)
      const { data: foods } = await foodQuery.limit(30)

      if (foods && foods.length > 0) {
        const relevant = foods.filter(f => {
          if (!f.diet_codes || f.diet_codes.length === 0) return true
          return f.diet_codes.some((code: string) => uniqueDietCodes.includes(code))
        })
        ragParts.push(`\nALIMENTOS ENCONTRADOS (${relevant.length}):\n${relevant.map(f => {
          const det = typeof f.details === 'string' ? f.details : JSON.stringify(f.details || {})
          return `- ${f.name} [${f.category}/${f.subcategory || ''}] dietas: ${(f.diet_codes || []).join(',')} | ${det}`
        }).join('\n')}`)
      } else {
        ragParts.push(`\nALIMENTOS: No se encontró "${foodName}" en la base de datos.`)
      }

      if (uniqueDietCodes.length > 0) {
        const { data: allFoods } = await supabase
          .from('nm_food_knowledge')
          .select('name, category, diet_codes')
          .overlaps('diet_codes', uniqueDietCodes)
          .limit(50)
        if (allFoods && allFoods.length > 0) {
          ragParts.push(`\nALIMENTOS PERMITIDOS (${allFoods.length}):\n${allFoods.map(f => `${f.name} [${f.category}]`).join(', ')}`)
        }
      }
      break
    }

    case 'comida_sugerencia':
    case 'receta_consulta': {
      const mealTime = entities.meal_time || ''
      let mealQ = supabase.from('nm_meal_catalog').select('name, meal_time, ingredients, protein_type, diet_codes, plate_code')
      if (uniqueDietCodes.length > 0) mealQ = mealQ.overlaps('diet_codes', uniqueDietCodes)
      if (mealTime) mealQ = mealQ.eq('meal_time', mealTime)
      const { data: meals } = await mealQ.limit(20)
      if (meals && meals.length > 0) {
        ragParts.push(`\nCOMIDAS (${meals.length}):\n${meals.map(m => `- ${m.name} [${m.meal_time}]: ${m.ingredients || ''}`).join('\n')}`)
      }

      const { data: breakfasts } = await supabase.from('nm_breakfast_catalog')
        .select('name, code, drinks, bread, toppings, dairy, fruits, extras, restrictions').limit(10)
      if (breakfasts && breakfasts.length > 0) {
        ragParts.push(`\nDESAYUNOS:\n${breakfasts.map(b => `- ${b.name}: ${b.drinks || ''}, ${b.bread || ''}, ${b.dairy || ''}, ${b.fruits || ''}`).join('\n')}`)
      }

      if (uniqueDietCodes.length > 0) {
        const { data: snacks } = await supabase.from('nm_snack_catalog')
          .select('name, fruits, dairy, nuts, diet_codes')
          .overlaps('diet_codes', uniqueDietCodes).limit(10)
        if (snacks && snacks.length > 0) {
          ragParts.push(`\nMERIENDAS:\n${snacks.map(s => `- ${s.name}: ${s.fruits || ''}, ${s.dairy || ''}, ${s.nuts || ''}`).join('\n')}`)
        }
      }
      break
    }

    case 'medicacion': {
      const { data: meds } = await supabase.from('nm_medications')
        .select('medication_name, dosage, frequency, side_effects, side_effects_treatment')
        .eq('patient_id', patientId).eq('is_active', true)
      if (meds && meds.length > 0) {
        ragParts.push(`\nMEDICACIÓN ACTIVA (NUNCA modificar):\n${meds.map(m => `- ${m.medication_name}: ${m.dosage || ''} | ${m.frequency || ''}`).join('\n')}`)
      } else {
        ragParts.push('\nMEDICACIÓN: Sin medicación registrada.')
      }
      break
    }

    case 'peso_progreso': {
      const { data: weights } = await supabase.from('nm_weight_records')
        .select('weight, date, notes')
        .eq('patient_id', patientId)
        .order('date', { ascending: false }).limit(10)
      const { data: pat } = await supabase.from('nm_patients')
        .select('current_weight, initial_weight, target_weight, height')
        .eq('id', patientId).single()
      if (pat) ragParts.push(`\nPESO: Actual ${pat.current_weight}kg | Inicial ${pat.initial_weight}kg | Objetivo ${pat.target_weight}kg | Altura ${pat.height}cm`)
      if (weights && weights.length > 0) {
        ragParts.push(`\nHISTORIAL:\n${weights.map(w => `- ${w.date}: ${w.weight}kg`).join('\n')}`)
      }
      break
    }

    case 'dieta_info':
    case 'horario_comidas': {
      const { data: daily } = await supabase.from('nm_daily_meals')
        .select('day_of_week, breakfast, lunch, dinner, snack_morning, snack_afternoon, notes')
        .eq('patient_id', patientId)
        .eq('is_active', true)
        .limit(30)
      if (daily && daily.length > 0) {
        ragParts.push(`\nMENÚ SEMANAL:\n${daily.map(m => `- ${m.day_of_week}: Desayuno: ${m.breakfast || '-'} | Almuerzo: ${m.lunch || '-'} | Cena: ${m.dinner || '-'}`).join('\n')}`)
      }
      break
    }

    default:
      break
  }

  return ragParts.join('\n\n') || 'Sin datos RAG.'
}

// ═══ MAIN HANDLER ════════════════════════════════════════════════════
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const startTime = Date.now()
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    const body = await req.json()

    // ══════════════════════════════════════════════════════════════════
    // NORMALIZE INPUT — accept BOTH formats:
    // Format A (direct): { message: "text", patient_id: "uuid" }
    // Format B (frontend): { messages: [{role,content}], patient_context: {patient_id} }
    // ══════════════════════════════════════════════════════════════════
    let userMessage: string
    let patientId: string
    let conversationId: string | null = body.conversation_id || null
    const isDirectCall = Boolean(body.message && body.patient_id)

    if (isDirectCall) {
      userMessage = body.message
      patientId = body.patient_id
    } else if (body.messages && body.patient_context?.patient_id) {
      const msgs = body.messages as Array<{role: string, content: string}>
      const lastUserMsg = [...msgs].reverse().find(m => m.role === 'user')
      userMessage = lastUserMsg?.content || ''
      patientId = body.patient_context.patient_id
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

    // ══ Conversation management ══
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

    // ══ Patient context ══
    const { data: patient } = await supabase
      .from('nm_patients')
      .select('full_name, current_weight, target_weight, initial_weight, height, age')
      .eq('id', patientId).single()

    const patientContext = patient
      ? `Nombre: ${patient.full_name || 'Paciente'} | Peso: ${patient.current_weight || '?'}kg | Objetivo: ${patient.target_weight || '?'}kg | Altura: ${patient.height || '?'}cm | Edad: ${patient.age || '?'}`
      : 'Paciente sin datos'

    // ══ Chat history (from DB) ══
    const { data: history } = await supabase
      .from('nm_chat_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false }).limit(6)

    const chatHistory = (history || []).reverse().map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    // Only insert user message for direct calls (frontend already inserts it)
    if (isDirectCall) {
      await supabase.from('nm_chat_messages').insert({
        conversation_id: conversationId,
        role: 'user',
        content: userMessage,
      })
    }

    // PHASE 1: CLASSIFY with Haiku (~400ms)
    const classifyStart = Date.now()
    const classification = await classifyIntent(userMessage, patientContext)
    const classifyTime = Date.now() - classifyStart
    console.log(`[Phase 1] ${classification.intent} (${classification.confidence}) ${classifyTime}ms`)

    // PHASE 2: RAG FETCH (~300-600ms)
    const ragStart = Date.now()
    const ragContext = await fetchRAGContext(supabase, classification.intent, classification.entities, patientId)
    const ragTime = Date.now() - ragStart
    console.log(`[Phase 2] RAG: ${ragContext.length} chars ${ragTime}ms`)

    // PHASE 3: FORMAT with Sonnet (~2-3s)
    const formatStart = Date.now()
    const formatterMessages = [
      ...chatHistory,
      {
        role: 'user' as const,
        content: `[CONTEXTO PACIENTE: ${patientContext}]\n[INTENCIÓN: ${classification.intent}]\n[DATOS RAG]:\n${ragContext}\n\n[MENSAJE]: ${userMessage}`
      }
    ]

    const formatResult = await callAnthropic(MODEL_FORMATTER, FORMATTER_SYSTEM, formatterMessages, 600)
    const formattedResponse = formatResult.text || 'Lo siento, no he podido procesar tu consulta.'
    const formatTime = Date.now() - formatStart
    const totalTime = Date.now() - startTime
    console.log(`[Phase 3] Format ${formatTime}ms | Total ${totalTime}ms`)

    // Save assistant message only for direct calls (frontend saves it after receiving response)
    if (isDirectCall && conversationId) {
      await supabase.from('nm_chat_messages').insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: formattedResponse,
        metadata: {
          intent: classification.intent,
          confidence: classification.confidence,
          entities: classification.entities,
          models: { classifier: MODEL_CLASSIFIER, formatter: MODEL_FORMATTER },
          timing: { classify_ms: classifyTime, rag_ms: ragTime, format_ms: formatTime, total_ms: totalTime },
          rag_length: ragContext.length,
        }
      })
    }

    if (conversationId) {
      await supabase.from('nm_chat_conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId)
    }

    // ══════════════════════════════════════════════════════════════════
    // RETURN — include ALL field names frontend might look for:
    //   response.data.content  ← frontend checks FIRST
    //   response.data.message  ← frontend checks SECOND
    //   response.data.response ← for direct API callers
    // ══════════════════════════════════════════════════════════════════
    return new Response(
      JSON.stringify({
        content: formattedResponse,
        message: formattedResponse,
        response: formattedResponse,
        conversation_id: conversationId,
        classification: {
          intent: classification.intent,
          confidence: classification.confidence,
          entities: classification.entities,
        },
        timing: {
          classify_ms: classifyTime,
          rag_ms: ragTime,
          format_ms: formatTime,
          total_ms: totalTime,
        },
        models: {
          classifier: MODEL_CLASSIFIER,
          formatter: MODEL_FORMATTER,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[nm-chat] Fatal:', error)
    return new Response(
      JSON.stringify({
        content: 'Lo siento, ha habido un error. Inténtalo de nuevo.',
        message: 'Lo siento, ha habido un error. Inténtalo de nuevo.',
        error: String(error),
        timing: { total_ms: Date.now() - startTime }
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
