#!/usr/bin/env node
/**
 * check-dietmap.mjs — Guarda de sincronía de DIET_CODE_MAP.
 * Referencia: src/lib/diet/constants.js (frontend).
 * Verifica: TODA definición de DIET_CODE_MAP bajo supabase/functions/
 * (index.ts de cada Edge Function y/o _shared/dietCodes.ts).
 * Salida ≠ 0 si cualquier copia diverge → CI en rojo. Desync silencioso imposible.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const extractMap = (src, file) => {
  const m = src.match(/(?:const|export const)\s+DIET_CODE_MAP[^=]*=\s*{([\s\S]*?)\n}/)
  if (!m) return null
  const pairs = {}
  for (const [, k, v] of m[1].matchAll(/['"]([^'"]+)['"]\s*:\s*['"]([^'"]+)['"]/g)) pairs[k] = v
  if (Object.keys(pairs).length === 0) { console.error(`✖ ${file}: mapa vacío`); process.exit(1) }
  return pairs
}

const ref = extractMap(readFileSync('src/lib/diet/constants.js', 'utf8'), 'constants.js')
if (!ref) { console.error('✖ DIET_CODE_MAP no encontrado en constants.js'); process.exit(1) }

const walk = (dir) => readdirSync(dir).flatMap((e) => {
  const p = join(dir, e)
  return statSync(p).isDirectory() ? walk(p) : /\.ts$/.test(e) ? [p] : []
})

let checked = 0, failed = 0
for (const file of walk('supabase/functions')) {
  const map = extractMap(readFileSync(file, 'utf8'), file)
  if (!map) continue
  checked++
  const allKeys = new Set([...Object.keys(ref), ...Object.keys(map)])
  const diffs = [...allKeys].filter((k) => ref[k] !== map[k])
  if (diffs.length) {
    failed++
    console.error(`✖ DESYNC en ${file}:`)
    for (const k of diffs) console.error(`    '${k}': frontend='${ref[k] ?? '∅'}' vs edge='${map[k] ?? '∅'}'`)
  } else {
    console.log(`✓ ${file} — ${Object.keys(map).length} entradas en sincronía`)
  }
}

if (checked === 0) { console.error('✖ Ninguna copia de DIET_CODE_MAP encontrada bajo supabase/functions'); process.exit(1) }
if (failed) process.exit(1)
console.log(`\n✅ check:dietmap OK — referencia frontend (${Object.keys(ref).length} entradas) vs ${checked} copia(s) edge`)
