// supabase/functions/nm-shopping/index.ts
// Edge Function: genera lista de la compra semanal para un paciente
// Trigger: llamada fire-and-forget desde DietTab tras cada cambio de dieta
// Modelo: claude-haiku-4-5-20251001 (extracción estructurada, coste mínimo)
// Versión: v1

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')    ?? ''
const SERVICE_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANTHROPIC_KEY   = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

// Categorías fijas — orden constante y presentación en el frontend
const CATEGORIES = [
  'proteinas', 'hidratos', 'verduras', 'frutas', 'grasas',
  'lacteos', 'legumbres', 'especias', 'bebidas', 'snacks',
  'congelados', 'conservas',
] as const

type CategoryKey = typeof CATEGORIES[number]
type ShoppingItems = Record<CategoryKey, string[]>

const EXTRACTOR_SYSTEM = `Eres un extractor de ingredientes para listas de la compra clínicas.
Analizas los menús semanales de un paciente de nutrición y devuelves EXCLUSIVAMENTE un objeto JSON válido.

Reglas:
- El JSON tiene exactamente estas 12 claves: "proteinas", "hidratos", "verduras", "frutas", "grasas", "lacteos", "legumbres", "especias", "bebidas", "snacks", "congelados", "conservas"
- Cada clave contiene un array de strings con ingredientes únicos (sin duplicados)
- Los ingredientes van en español, sin cantidades, sin unidades, sin artículos ("Pollo" no "El pollo")
- Ordena los ingredientes de cada categoría alfabéticamente
- Infiere ingredientes razonables aunque no sean explícitos (si hay tortilla → huevos, si hay ensalada → tomate, lechuga, etc.)
- Clasifica correctamente: el queso fresco 0% va en "lacteos", el aguacate en "grasas", los frutos secos en "snacks" o "grasas"
- Si una categoría no tiene ingredientes relevantes, devuelve array vacío []
- PROHIBIDO: markdown, texto adicional, comentarios, backticks. SOLO el objeto JSON.`

Deno.serve(async (req: Request): Promise<Response> => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json()
    const { patient_id, professional_id } = body

    if (!patient_id) {
      return new Response(JSON.stringify({ error: 'patient_id requerido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const db = createClient(SUPABASE_URL, SERVICE_KEY)

    const { data: patient } = await db
      .from('nm_patients')
      .select('full_name, food_intolerances, allergies_medications')
      .eq('id', patient_id)
      .single()

    const { data: dietPlans } = await db
      .from('nm_diet_plans')
      .select('diet_type, diet_name, day_of_week, notes')
      .eq('patient_id', patient_id)
      .eq('is_active', true)

    const { data: dailyMeals } = await db
      .from('nm_daily_meals')
      .select('day_of_week, breakfast, lunch, dinner, snack_morning, snack_afternoon, notes')
      .eq('patient_id', patient_id)
      .eq('is_active', true)

    const dietSummary = (dietPlans ?? []).map((p: Record<string, string>) =>
      `${p.day_of_week === 'todos' ? 'TODOS LOS DÍAS' : p.day_of_week.toUpperCase()}: ${p.diet_name || p.diet_type}${p.notes ? ` (nota: ${p.notes})` : ''}`
    ).join('\n')

    const mealLines = (dailyMeals ?? []).map((m: Record<string, string>) => [
      `\n--- ${m.day_of_week.toUpperCase()} ---`,
      m.breakfast       ? `Desayuno: ${m.breakfast}`           : null,
      m.snack_morning   ? `Media mañana: ${m.snack_morning}`   : null,
      m.lunch           ? `Comida: ${m.lunch}`                 : null,
      m.snack_afternoon ? `Merienda: ${m.snack_afternoon}`     : null,
      m.dinner          ? `Cena: ${m.dinner}`                  : null,
      m.notes           ? `Indicaciones: ${m.notes}`           : null,
    ].filter(Boolean).join('\n')).join('\n')

    const intolerances = patient?.food_intolerances
      ? `\nIntolerancias/alergias: ${patient.food_intolerances}` : ''

    const userContext = [
      `PACIENTE: ${patient?.full_name || 'Sin nombre'}`,
      intolerances,
      '\n=== PLAN DE DIETAS SEMANAL ===',
      dietSummary || 'Sin plan asignado',
      '\n=== MENÚS DIARIOS DETALLADOS ===',
      mealLines || 'Sin menús configurados',
    ].filter(Boolean).join('\n')

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: EXTRACTOR_SYSTEM,
        messages: [{
          role: 'user',
          content: `Genera la lista de la compra semanal para este paciente:\n\n${userContext}`,
        }],
      }),
    })

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text()
      console.error('[nm-shopping] Anthropic error:', errText)
      return new Response(JSON.stringify({ error: 'Error al generar lista con IA' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const anthropicData = await anthropicRes.json()
    const rawContent = anthropicData?.content?.[0]?.text ?? '{}'

    let items: Partial<ShoppingItems> = {}
    try {
      const cleaned = rawContent.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(cleaned)
      for (const cat of CATEGORIES) {
        items[cat] = Array.isArray(parsed[cat])
          ? parsed[cat].map((s: unknown) => String(s)).filter(Boolean)
          : []
      }
    } catch (parseErr) {
      console.error('[nm-shopping] JSON parse error:', parseErr, 'raw:', rawContent)
      for (const cat of CATEGORIES) items[cat] = []
    }

    await db
      .from('nm_shopping_lists')
      .update({ is_current: false })
      .eq('patient_id', patient_id)
      .eq('is_current', true)

    const { data: newList, error: insertErr } = await db
      .from('nm_shopping_lists')
      .insert({
        patient_id,
        professional_id: professional_id ?? null,
        diet_summary: dietSummary || null,
        items,
        is_current: true,
        generated_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertErr) {
      console.error('[nm-shopping] insert error:', insertErr)
      return new Response(JSON.stringify({ error: 'Error al guardar lista' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, id: newList.id }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[nm-shopping] unexpected error:', err)
    return new Response(JSON.stringify({ error: 'Error interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
