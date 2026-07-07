import { describe, it, expect, vi, afterEach } from 'vitest'
import { getTodaySlug, getDaysRemaining, formatDate, formatDateShort } from '../utils.js'

afterEach(() => vi.useRealTimers())

describe('getTodaySlug', () => {
  it('devuelve el slug correcto según Date.getDay()', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-06T12:00:00Z')) // lunes
    expect(getTodaySlug()).toBe('lunes')
    vi.setSystemTime(new Date('2026-07-12T12:00:00Z')) // domingo
    expect(getTodaySlug()).toBe('domingo')
  })
})

describe('getDaysRemaining', () => {
  it('null si no hay fecha', () => {
    expect(getDaysRemaining(null)).toBeNull()
    expect(getDaysRemaining('')).toBeNull()
  })
  it('días positivos hacia el futuro (ceil) y negativos si expiró', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-07T10:00:00Z'))
    expect(getDaysRemaining('2026-07-10T10:00:00Z')).toBe(3)
    expect(getDaysRemaining('2026-07-07T22:00:00Z')).toBe(1) // fracción → ceil
    expect(getDaysRemaining('2026-07-05T10:00:00Z')).toBe(-2)
  })
})

describe('formatDate / formatDateShort', () => {
  it('cadena vacía con null', () => {
    expect(formatDate(null)).toBe('')
    expect(formatDateShort(null)).toBe('')
  })
  it('formato es-ES largo y corto', () => {
    expect(formatDate('2026-03-05T00:00:00Z')).toMatch(/5.*mar.*2026/)
    expect(formatDateShort('2026-03-05T00:00:00Z')).toMatch(/5.*mar/)
    expect(formatDateShort('2026-03-05T00:00:00Z')).not.toMatch(/2026/)
  })
})
