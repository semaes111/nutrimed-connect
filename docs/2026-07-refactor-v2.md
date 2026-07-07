# INFORME DE REFACTORIZACIÓN v2 — NutriMed Connect
**Fecha:** 2026-07-07 · **Repo:** `semaes111/nutrimed-connect` @ `c35debc` (HEAD main)
**Metodología:** Ponytail (full) + Spec-Driven Development · **Tipo:** Auditoría read-only — ningún cambio aplicado
**Estado:** ⏸️ PENDIENTE DE APROBACIÓN — ejecutar solo tras "ok/go/si" por fase

---

## 0 · Resumen ejecutivo

| Métrica | Estado actual | Tras refactor v2 |
|---|---|---|
| LOC en `src/` | 6.650 (37 archivos JS/JSX) | ≈ 6.400 (−250) |
| Código muerto | 220 líneas (`createService` 45 + `nativeNotifications` 175) | 0 |
| Dependencias muertas | 1 (`date-fns`) | 0 |
| Copias de `DIET_CODE_MAP` | **4** (frontend + 3 Edge Functions) | 2 verificadas por script |
| Duplicación literal | `CATEGORIES` ×2 (30 líneas) | 1 export compartido |
| Imports inconsistentes (barrel vs directo) | 5 / 5 | 10 / 0 vía barrel |
| Tests / Lint / CI | 0 / 0 / 0 | vitest + ESLint + GH Action |
| Riesgo de regresión del plan | — | Bajo (todo aditivo o eliminación con 0 callers) |

**Diferencia con el REFACTOR-REPORT.md de marzo-2026:** aquel cubrió la fase estructural ya ejecutada (split de `dietConfig` → `diet/`, split de `ProPatientDetail` → tabs, fixes de seguridad). Este informe audita el estado **posterior** y no repite nada de aquello.

---

## 1 · Constitución aplicable (gobierna todo el plan)

Fusión de `nexthorizont-architecture-rules.md` (adaptada al stack real del repo) + `nutrimed-surgical-prompt.md` (Contratos 1–10):

1. **Stack real e inmutable:** React 18 + Vite + Tailwind v4 + Supabase (anon key + RLS) + Edge Functions Deno + Docker/Nginx/Dokploy. **No** se migra a Next.js ni a TypeScript en frontend (decisión consolidada marzo-2026: "mantenemos React/Vite"). Las reglas de Server Components/`"use server"` no aplican a este repo — aplican TS estricto donde ya hay TS (Edge Functions: cero `any`, y se cumple: usan `Record<string, string>` tipados).
2. **Contratos quirúrgicos vigentes** — violación = rechazo del cambio:
   - C2: cero regresiones — cambios en archivos existentes solo aditivos.
   - C3: cero cambios de BD (ninguna tarea de este plan toca esquema, RLS ni RPCs).
   - C4: barrel `dietConfig.js` intacto — todo símbolo nuevo en `diet/constants.js` se re-exporta.
   - C5: `DIET_CODE_MAP` frontend ↔ Edge Functions se mantiene duplicado **entre capas**, pero se elimina la triplicación **dentro** de las Edge Functions (ver H-05).
   - C6: los fallbacks hardcodeados de `src/lib/supabase.js:3-4` **no se tocan** (Dokploy no pasa Build ARGs a Vite). Ver T9.
   - C7–C8: props de tabs `{ patient, professionalId?, onUpdate? }` y dark metallic theme intactos.
3. **Test-first** donde se añade guarda: los tests de `lib/diet/` se escriben **antes** del script de verificación (rojo → verde).
4. **YAGNI/ponytail:** eliminación antes que adición; ninguna abstracción sin ≥2 consumidores reales; ningún split de archivo sin driver funcional.
5. **Intocables absolutos:** `AuthContext.jsx`, `App.jsx` (salvo ruta nueva), RPCs (`assign_base_diet`, `override_day_diet`, `remove_day_override`, `get_patient_weekly_diet`), tablas `nm_*`, políticas RLS (las 4 corregidas en el sprint de bugs incluidas), comportamiento runtime de `nm-chat`/`nm-scanner` v13/`nm-shopping` determinista, auth de paciente por código de 8 caracteres en `localStorage`.

---

## 2 · SPEC — Qué y porqué

**Objetivo:** reducir superficie de mantenimiento del repo (código muerto, duplicación, inconsistencia de imports) y añadir las guardas mínimas que previenen las dos clases de fallo recurrentes documentadas: (a) desincronización de `DIET_CODE_MAP` entre archivos —causa raíz histórica de fallos silenciosos—, (b) regresiones sin red al no existir test/lint/CI.

**Resultado esperado:** mismo comportamiento observable para paciente y profesional (cero cambios funcionales), menos líneas, un único punto de verdad por constante de dominio, y `git push` que falla en CI si el build, el lint, los tests o la sincronía de mapas se rompen.

**No-goals (explícitos):**
- NG-1: No migrar a TypeScript, Next.js ni cambiar el sistema de auth de pacientes.
- NG-2: No dividir archivos grandes por tamaño (`ShoppingList.jsx` 526, `PatientDashboard.jsx` 480, `ProPatientForm.jsx` 445). La señal 🟡 de las reglas ("componente >100 líneas: considerar") no justifica splits especulativos sobre producción estable. Se dividirán cuando un cambio funcional los toque.
- NG-3: No unificar las tres `formatDate` (ver H-07: no son duplicación real).
- NG-4: No tocar `nm-shopping` v8 determinista ni el parser `.find(b => b.type === 'text')` de MiMo.
- NG-5: No añadir suite de tests exhaustiva — solo lógica pura de `lib/diet/` (YAGNI aplica a tests).

---

## 3 · Hallazgos con evidencia

### 3.1 Código muerto — eliminar

**H-01 · `createService()` — abstracción con 0 consumidores** 🔴
`src/lib/supabase.js:9-53` (~45 líneas). Factory genérico CRUD (`list/getById/create/update/remove`). Verificado: `grep -rn "createService(" src/` fuera de su definición → **0 resultados**. Las 14 páginas/componentes que acceden a datos importan `supabase` directamente. Es exactamente el anti-patrón "factory para un producto que nadie fabrica".
**Acción:** eliminar la función y su export. Riesgo: nulo (0 callers). El `export const supabase` de la línea 6 no se toca.

**H-02 · `src/lib/nativeNotifications.js` — módulo huérfano de 175 líneas** 🟠 *(requiere tu decisión)*
Verificado: 0 imports en todo `src/`. El permiso de notificaciones ya se gestiona inline en `capacitorBoot.js:34` (`await import('@capacitor/local-notifications')`), así que el arranque Android no depende de este archivo.
Contexto: pertenece al HITO 5 (APK Capacitor, parcialmente iniciado). Opciones:
- **(a) Recomendada — borrar.** Git recuerda: `git log --all -- src/lib/nativeNotifications.js` lo recupera en un comando cuando HITO 5 lo necesite de verdad. Código no importado no se testea, no se lintea y se pudre.
- **(b) Conservar** con cabecera `// ponytail: huérfano deliberado — scheduling de recordatorios HITO 5, activar importándolo desde capacitorBoot`.

**H-03 · `date-fns` — dependencia muerta** 🟠
`package.json:23`. Verificado: 0 imports estáticos y 0 dinámicos en `src/`, `index.html` y `capacitor.config.ts` (todas las fechas usan `toLocaleDateString('es-ES', …)` nativo — el patrón ponytail correcto, rung 4). Eliminar del `package.json` reduce `npm install` y superficie de supply-chain.
**Acción:** `npm uninstall date-fns` (regenera lockfile). Riesgo: nulo.

### 3.2 Duplicación — consolidar

**H-04 · `CATEGORIES` duplicado verbatim ×2** 🟠
`src/pages/patient/ShoppingList.jsx:19-33` y `src/components/pro/tabs/ShoppingListTab.jsx:16-30`. **Diff = idénticos** (15 líneas: las categorías de lista de la compra con icono/label/color). Es dominio de dieta/compra → su casa natural es `src/lib/diet/constants.js`.
**Acción:** mover a `constants.js` como `export const SHOPPING_CATEGORIES`, re-exportar en el barrel `dietConfig.js` (Contrato 4), sustituir las 2 definiciones locales por el import. Cambio aditivo puro.

**H-05 · `DIET_CODE_MAP` cuadruplicado** 🔴 *(causa raíz histórica de fallos silenciosos)*
Cuatro copias verificadas:
| Archivo | Línea |
|---|---|
| `src/lib/diet/constants.js` | 42 |
| `supabase/functions/nm-chat/index.ts` | 33 |
| `supabase/functions/nm-scanner/index.ts` | 53 |
| `supabase/functions/nm-shopping/index.ts` | 9 |

El Contrato 5 obliga a mantener la copia frontend ↔ servidor (Vite no puede importar de Deno ni viceversa). Pero **entre las 3 Edge Functions sí hay import relativo Deno** — patrón ya validado en este proyecto ("archivos >15K se parten con imports relativos Deno").
**Acción (2 partes):**
1. Crear `supabase/functions/_shared/dietCodes.ts` con el mapa único; las 3 EFs lo importan (`import { DIET_CODE_MAP } from '../_shared/dietCodes.ts'`). 4 copias → 2.
2. Guard determinista: `scripts/check-dietmap.mjs` (~30 líneas Node, regex sobre los 2 archivos, `process.exit(1)` si divergen) + `"check:dietmap"` en `package.json` + paso en CI. El desync deja de ser posible en silencio.
⚠️ **Gate:** la parte 1 exige redeploy de las 3 Edge Functions (vía MCP `deploy_edge_function`, `verify_jwt: false`, contenido inline, ñ/á escapadas Unicode). Requiere tu aprobación explícita y verificación post-deploy por función.

### 3.3 Inconsistencia — normalizar

**H-06 · Barrel roto por la mitad** 🟡
5 archivos importan vía `lib/dietConfig` (barrel) y 5 directo de `lib/diet/*`: `AccessTab.jsx`, `DietTab.jsx`, `OverviewTab.jsx`, `WeightTab.jsx`, `ProPatientDetail.jsx`. Dos rutas para el mismo símbolo = grep parcial y refactors que rompen la mitad.
**Acción:** cambiar la línea de import en esos 5 archivos al barrel. Cero cambios de lógica.

### 3.4 Guardas ausentes

**H-07 · Cero tests, cero lint, cero CI** 🔴
No existe `eslint.config.*`, ni `vitest/jest`, ni `.github/workflows/`. La constitución exige test-first y quality gates; hoy el único gate es "desplegar y mirar".
**Acción (mínimo ponytail, no suite completa):**
- ESLint 9 flat config + `eslint-plugin-react-hooks` (la clase de bug que más pega en este repo: deps de `useEffect`).
- Vitest sobre **lógica pura sin mocks**: `lib/diet/utils.js` (`getTodaySlug`, `getDaysRemaining`, `formatDate`) y `lib/diet/templates.js` (`buildMealsFromTemplates`). Un archivo de test cada uno.
- GitHub Action de ~18 líneas: `npm ci → lint → test → check:dietmap → build`. Sin matrices, sin caché exótica.

**H-08 · Fallback de MiMo API key hardcodeado en Edge Functions** 🟠 *(requiere tu decisión)*
`nm-chat/index.ts:7` documenta: "Fallback updated to active key. TODO follow-up" (commit `c35debc` rotó el fallback a la key activa `tp-eh19o4…`). El secret `MIMO_API_KEY` ya existe en Supabase. Una key viva en git = rotación forzosa ante cualquier fuga del repo (aunque sea privado).
- **(a) Recomendada:** verificar que las EFs leen `Deno.env.get('MIMO_API_KEY')` con éxito en producción → eliminar el fallback literal (`?? 'tp-…'` → error explícito si falta el secret).
- **(b) Conservar** el fallback como resiliencia (mismo trade-off que Contrato 6, pero aquí el secret **sí** funciona — a diferencia de los Build ARGs de Dokploy — así que la analogía no sostiene).
⚠️ Gate: toca las 3 EFs en producción → misma ventana de deploy que H-05.

### 3.5 No-hallazgos (verificado y descartado — trabajo que NO hay que hacer)

- **`formatDate` ×3 NO es duplicación:** paciente (`weekday long`), pro (`weekday short + hora`) y `diet/utils.js` (sin weekday) producen formatos **distintos a propósito**. Unificarlas exigiría una función parametrizada — más complejidad que tres funciones de 8 líneas. Se dejan como están.
- **`console.*` ya está limpio:** 24 `console.error` + 2 `console.warn` + **0 `console.log`**. Todo es error-handling legítimo exigido por las reglas. Nada que limpiar.
- **Capacitor deps NO están muertas:** `@capacitor/camera`, `local-notifications` y `@capgo/capacitor-updater` se cargan por import dinámico (`capacitorBoot.js:25,34`, `nativeCamera.js:72,148`) — patrón correcto para no romper el bundle web. No tocar.
- **`dist/` no está trackeado**, `manualChunks` de Vite bien particionado (vendor/charts/supabase), TODOs reales: solo 1 (el de H-08).

---

## 4 · PLAN — Fases, riesgo y blast radius

| Fase | Contenido | Blast radius | Deploy necesario | Gate |
|---|---|---|---|---|
| **F1 — Limpieza frontend** | T1–T5 (muertos + CATEGORIES + barrel) | Solo `src/` + `package.json` | Rebuild Dokploy (`git fetch --all && git reset --hard origin/main` en `/etc/dokploy/applications/nutrimed-nutrimed-8l9wwd/code/` + full rebuild, no restart) | "ok" tuyo + decisión H-02 |
| **F2 — Guardas** | T6–T7 (lint, vitest, check-dietmap, CI) | Solo tooling; 0 runtime | Ninguno | "ok" tuyo |
| **F3 — Edge Functions** | T8 (`_shared/dietCodes.ts`) + T9-EF (fallback MiMo) | 3 EFs en producción | Redeploy vía MCP, 1 función por vez con verificación entre cada una | **Aprobación explícita + decisión H-08 + ventana** |

Orden F1 → F2 → F3: F2 crea la red (tests + check-dietmap) **antes** de tocar las EFs en F3. Cada fase = commits atómicos independientes + push a `nutrimed-connect` **y** `NUTRIMED-CONNECT-BACKUP` con verificación de hash especular (`LOCAL == BACKUP`). Rollback por fase: `git revert` del rango.

---

## 5 · TASKS — Desglose ejecutable

Formato: `[T#] [fase] [P?=paralelizable] descripción → verificación`. Test-first: T6 precede a T7-script.

- **T1** · F1 · Eliminar `createService` de `src/lib/supabase.js` (líneas 8-53, conservar cliente y export `supabase`). → `grep -rn createService src/` = 0; `npm run build` OK. Commit: `refactor(lib): remove dead createService factory — 0 callers`
- **T2** · F1 · P · `npm uninstall date-fns`. → `grep -rn date-fns src/ package.json` = 0; build OK. Commit: `chore(deps): remove unused date-fns`
- **T3** · F1 · P · **[DECISIÓN H-02]** Borrar `src/lib/nativeNotifications.js` (opción a) o añadir cabecera ponytail (opción b). → build OK. Commit: `refactor(lib): drop orphaned nativeNotifications — recover via git when HITO-5 lands`
- **T4** · F1 · Mover `CATEGORIES` → `src/lib/diet/constants.js` como `SHOPPING_CATEGORIES` + re-export en `dietConfig.js` (Contrato 4) + import en `ShoppingList.jsx` y `ShoppingListTab.jsx` borrando las copias locales. → diff visual de ambas listas idéntico en dev; build OK. Commit: `refactor(diet): single source for SHOPPING_CATEGORIES`
- **T5** · F1 · Normalizar imports al barrel en los 5 archivos de H-06 (solo línea de import). → `grep -rl "from ['\"].*lib/diet/" src/` = 0 fuera de `dietConfig.js`; build OK. Commit: `refactor(imports): route all diet imports through barrel`
- **T6** · F2 · Vitest + `src/lib/diet/__tests__/utils.test.js` y `templates.test.js` (lógica pura, sin mocks; casos: slug del día, días restantes con null/pasado, template por dieta con `DIET_CODE_MAP` conocido). Escribir tests primero → rojo si se rompe un contrato. → `npm test` verde. Commit: `test(diet): pure-logic coverage for utils and templates`
- **T7** · F2 · ESLint flat + `scripts/check-dietmap.mjs` + scripts npm (`lint`, `test`, `check:dietmap`) + `.github/workflows/ci.yml` (~18 líneas: ci → lint → test → check:dietmap → build). → CI verde en push a rama de prueba. Commit: `chore(ci): minimal quality gates — lint, test, dietmap sync, build`
- **T8** · F3 · **[GATE]** `supabase/functions/_shared/dietCodes.ts` + import relativo en las 3 EFs, eliminando sus mapas locales. Redeploy 1×1 vía MCP (`verify_jwt: false`), verificando tras cada una (chat responde, scanner clasifica producto neutro, shopping genera lista <2s). → `check:dietmap` verde contra `_shared`. Commit: `refactor(edge): shared DIET_CODE_MAP across nm-chat/nm-scanner/nm-shopping`
- **T9** · F3 · P · **[DECISIÓN H-08]** Pre-flight: invocar cada EF y confirmar en logs que `MIMO_API_KEY` (secret) se usa → eliminar fallback literal con error explícito si falta. Redeploy mismas condiciones que T8. Commit: `fix(security,edge): drop hardcoded MiMo fallback — env secret required`
- **T10** · F3 · P · Higiene documental: mover `REFACTOR-REPORT.md` → `docs/2026-03-refactor-v1.md`, añadir este informe como `docs/2026-07-refactor-v2.md`, y comentario en `supabase.js:3` → `// ponytail: fallback deliberado — Dokploy no pasa Build ARGs a Vite. NO eliminar (Contrato 6).` Commit: `docs: archive refactor reports, annotate deliberate supabase fallback`

**Verificación global de cierre:** build Vite OK · `npm test` verde · `check:dietmap` verde · smoke manual (login pro con cuenta test `sergio@nutrimedconnect.com`, login paciente por código, chat, scanner, lista compra, asignar dieta) · push especular a ambos repos con hashes idénticos · rebuild Dokploy completo.

---

## 6 · Contratos preservados (no se cambia)

- Esquema BD, RLS (incl. las 4 policies `anon SELECT` corregidas), RPCs: **cero cambios** (Contrato 3).
- `AuthContext.jsx`, `App.jsx`, props de tabs, dark metallic theme: intactos.
- Fallbacks de `supabase.js`: intactos y ahora documentados (Contrato 6).
- Comportamiento de `nm-shopping` determinista, `nm-scanner` v13 (categorías neutras), parser MiMo `.find(b => b.type==='text')`, `max_tokens ≥ 4096`, modelos `mimo-v2.5`/`mimo-v2-omni`: intactos.
- Valores de `DIET_CODE_MAP`/`BREAKFAST_MAP`: idénticos byte a byte — solo cambia dónde viven.

## 7 · Decisiones que necesito de ti antes de ejecutar

1. **H-02** `nativeNotifications.js`: ¿borrar (a, recomendada) o conservar anotado (b)?
2. **H-08** fallback MiMo en EFs: ¿eliminar tras pre-flight (a, recomendada) o conservar (b)?
3. **Fases a aprobar:** ¿F1 sola, F1+F2, o plan completo con ventana para F3?

Con tu "go" por fase, ejecuto con protocolo quirúrgico: declaración de scope → commits atómicos → push especular → verificación independiente post-cambio.
