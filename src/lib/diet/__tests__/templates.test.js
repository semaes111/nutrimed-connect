import { describe, it, expect } from 'vitest'
import { buildBreakfastTemplate, buildLunchDinnerTemplate, buildSnackTemplate, buildSnackFromCatalog, buildMealsFromTemplates } from '../templates.js'
import { DAYS_ORDER } from '../constants.js'

describe('buildBreakfastTemplate', () => {
  it('vacío con null; renderiza solo campos presentes bajo BASE FIJA', () => {
    expect(buildBreakfastTemplate(null)).toBe('')
    const out = buildBreakfastTemplate({ drinks: 'café solo', bread: 'integral' })
    expect(out).toContain('BASE FIJA')
    expect(out).toContain('☕ Bebidas: café solo')
    expect(out).toContain('🍞 Pan: integral')
    expect(out).not.toContain('Lácteos')
  })
})

describe('buildLunchDinnerTemplate', () => {
  const platos = [
    { name: 'Merluza plancha', ingredients: 'merluza, limón' },
    { name: 'Pollo al horno' },
    { name: 'Lentejas' },
    { name: 'Tortilla' },
    { name: 'Salmón' },
  ]
  it('vacío sin platos', () => {
    expect(buildLunchDinnerTemplate([])).toBe('')
    expect(buildLunchDinnerTemplate(null)).toBe('')
  })
  it('máximo 4 opciones, con ingredientes si existen', () => {
    const out = buildLunchDinnerTemplate(platos, 0)
    expect(out).toContain('OPCIÓN A')
    expect(out).toContain('OPCIÓN D')
    expect(out).not.toContain('Salmón')
    expect(out).toContain('Merluza plancha\n   merluza, limón')
  })
  it('el offset rota el orden (contrato de rotación diaria)', () => {
    const out = buildLunchDinnerTemplate(platos, 1)
    const posA = out.indexOf('OPCIÓN A')
    expect(out.slice(posA).startsWith('OPCIÓN A ═══\n🍽️ Pollo al horno')).toBe(true)
    expect(out).toContain('Salmón') // el 5º entra al rotar
  })
})

describe('buildSnackTemplate', () => {
  it('mapa por código y fallback por defecto', () => {
    expect(buildSnackTemplate('D07')).toContain('Yogur natural sin azúcar')
    expect(buildSnackTemplate('D99')).toContain('Fruta de temporada')
  })
})

describe('buildSnackFromCatalog', () => {
  const rows = [{
    fruits: 'manzana, pera, kiwi, naranja',
    nuts: 'nueces, almendras',
    dairy: 'yogur natural, kéfir',
    others: '',
    bread: 'PROHIBIDO',
    toppings: 'tomate',
  }]
  it('vacío sin filas', () => {
    expect(buildSnackFromCatalog([], 0)).toBe('')
  })
  it('rotación determinista y merienda ≠ media mañana (offset 3)', () => {
    const morning = buildSnackFromCatalog(rows, 0, false)
    const afternoon = buildSnackFromCatalog(rows, 0, true)
    expect(morning).toContain('🍎 Frutas: manzana, pera, kiwi')
    expect(afternoon).toContain('🍎 Frutas: naranja, manzana, pera')
    expect(morning).not.toBe(afternoon)
  })
  it('pan PROHIBIDO nunca genera línea de tostada', () => {
    expect(buildSnackFromCatalog(rows, 0)).not.toContain('Tostada')
  })
})

describe('buildMealsFromTemplates (orquestador)', () => {
  const bfCatalog = [{ name: 'Acelerado Rescate', drinks: 'café o infusión' }]
  const mk = (n, codes) => ({ id: n, name: 'Plato ' + n, diet_codes: codes })

  it('respeta comidas guardadas con contenido real (no auto-rellena)', () => {
    const saved = { lunes: { day_of_week: 'lunes', breakfast: 'MI DESAYUNO', lunch: '', dinner: '' } }
    const { mealsMap, autoFilled } = buildMealsFromTemplates(
      [{ day_of_week: 'todos', diet_type: 'rescate' }], saved, [mk(1, ['D07'])], bfCatalog
    )
    expect(mealsMap.lunes.breakfast).toBe('MI DESAYUNO')
    expect(autoFilled.lunes).toBeUndefined()
    expect(autoFilled.martes).toBe(true)
  })

  it('plan "todos" + diet_type resuelve código vía DIET_CODE_MAP y rellena la semana', () => {
    const catalog = [1,2,3,4,5,6,7,8].map(n => mk(n, ['D07']))
    const { mealsMap } = buildMealsFromTemplates(
      [{ day_of_week: 'todos', diet_type: 'rescate' }], {}, catalog, bfCatalog
    )
    expect(Object.keys(mealsMap)).toHaveLength(DAYS_ORDER.length)
    expect(mealsMap.martes.breakfast).toContain('café o infusión')
    expect(mealsMap.martes.lunch).toContain('OPCIÓN A')
    expect(mealsMap.martes.snack_morning).toContain('Yogur') // fallback buildSnackTemplate(D07)
  })

  it('DIET_FALLBACK: D08 con catálogo escaso hereda platos de D07', () => {
    const catalog = [1,2,3,4,5,6,7,8,9].map(n => mk(n, ['D07']))
    const { mealsMap } = buildMealsFromTemplates(
      [{ day_of_week: 'todos', diet_type: 'rescate-proteica-v2' }], {}, catalog, bfCatalog
    )
    expect(mealsMap.lunes.lunch).toContain('Plato') // sin fallback estaría vacío
  })

  it('rotación diaria: lunes y martes muestran opciones distintas', () => {
    const catalog = [1,2,3,4,5,6,7,8,9,10].map(n => mk(n, ['D07']))
    const { mealsMap } = buildMealsFromTemplates(
      [{ day_of_week: 'todos', diet_type: 'rescate' }], {}, catalog, bfCatalog
    )
    expect(mealsMap.lunes.lunch).not.toBe(mealsMap.martes.lunch)
    expect(mealsMap.lunes.lunch).not.toBe(mealsMap.lunes.dinner)
  })
})
