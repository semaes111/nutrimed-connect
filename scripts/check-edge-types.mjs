import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

// Use the SDK pinned in package-lock.json. Avoid relying on JSR availability for
// the runtime declaration: the identical declaration is shipped in the npm SDK.
const temp = mkdtempSync(join(tmpdir(), 'nutrimed-edge-types-'))
try {
  const map = join(temp, 'import-map.json')
  writeFileSync(map, JSON.stringify({ imports: {
    'jsr:@supabase/functions-js/edge-runtime.d.ts': pathToFileURL(
      resolve('node_modules/@supabase/functions-js/src/edge-runtime.d.ts'),
    ).href,
  } }))
  const result = spawnSync('npx', ['--yes', 'deno@2.9.6', 'check',
    '--node-modules-dir=manual', '--no-lock', '--import-map', map,
    'supabase/functions/nm-chat/index.ts',
    'supabase/functions/nm-scanner/index.ts',
    'supabase/functions/nm-shopping/index.ts',
  ], { stdio: 'inherit' })
  if (result.error) console.error(result.error.message)
  process.exitCode = result.status ?? 1
} finally {
  rmSync(temp, { recursive: true, force: true })
}
