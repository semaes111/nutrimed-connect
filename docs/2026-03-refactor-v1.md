# Informe de Refactorización — NutriMed Connect
**Fecha:** 2026-03-05 | **Modelo:** Claude Sonnet 4.6

---

## Resumen Ejecutivo

| Métrica | Antes | Después |
|---|---|---|
| `ProPatientDetail.jsx` | 870 líneas / 7 componentes inline | ~100 líneas (shell) |
| `dietConfig.js` | 115 líneas / 5 responsabilidades mezcladas | 3 módulos + 1 barrel |
| Credenciales hardcodeadas | 2 archivos con secrets en bundle | 0 — solo variables de entorno |
| Async sin try/catch | 15+ funciones con errores silenciados | 0 — todas con manejo explícito |
| Severidad CRÍTICA resuelta | 0/3 | 3/3 ✅ |

---

## FASE N1 — Security Fixes (Bajo riesgo)

### ✅ Fix 1: `src/lib/supabase.js`
**QUÉ cambió:** Eliminados los fallbacks hardcodeados de `supabaseUrl` y `supabaseAnonKey`.
**POR QUÉ:** Si `VITE_SUPABASE_URL` o `VITE_SUPABASE_ANON_KEY` no estaban definidas, el código usaba
  silenciosamente las credenciales de producción embebidas en el bundle — imposible rotarlas sin un
  cambio de código.
**BENEFICIO:** Ahora lanza un error explícito y descriptivo en tiempo de arranque si faltan las variables.
  Las credenciales ya no viajan en el código fuente ni en el bundle de producción.

```bash
# Commit sugerido
git add src/lib/supabase.js
git commit -m "fix(security): remove hardcoded Supabase credentials — require env vars"
```

### ✅ Fix 2: `src/pages/patient/PatientChat.jsx`
**QUÉ cambió (3 cambios):**
1. **Eliminada `SERVICE_KEY`** — la constante contenía el JWT de `service_role` expuesta en el bundle.
   Un atacante con DevTools podía extraerla y hacer SELECT/INSERT/UPDATE/DELETE en toda la BD sin RLS.
2. **`EDGE_URL` dinámica** — se construye desde `import.meta.env.VITE_SUPABASE_URL` en vez de estar
   hardcodeada con la URL de producción.
3. **Authorization con JWT de sesión** — `handleSend` ahora obtiene `session.access_token` de `supabase.auth.getSession()`
   y lo usa como `Bearer` token. La Edge Function autentica la petición y usa su propia `SERVICE_ROLE_KEY`
   definida como variable de entorno en el servidor (nunca expuesta al cliente).
4. **Error handling en `loadOrCreateConversation`** — envuelto en try/catch con mensaje visible al usuario.
5. **Verificación de errores en inserts** — los `supabase.from().insert()` de mensajes ahora comprueban
   el campo `error` y loguean en consola si algo falla.

```bash
git add src/pages/patient/PatientChat.jsx
git commit -m "fix(security): remove service_role key from frontend bundle, use session JWT for Edge Function auth"
```

---

## FASE N2 — Structural Refactoring (Riesgo medio)

### ✅ Refactor 3: `src/lib/dietConfig.js` → 3 módulos especializados

**Antes:** Un archivo de 115 líneas mezclando 5 responsabilidades distintas.

**Después — 3 módulos + 1 barrel:**
```
src/lib/diet/
  constants.js   → DIET_CONFIG, getDietConfig, DAYS_ORDER, DAY_LABELS,
                   DIET_CODE_MAP, BREAKFAST_MAP
  utils.js       → getTodaySlug, getDaysRemaining, formatDate, formatDateShort
  templates.js   → buildBreakfastTemplate, buildLunchDinnerTemplate,
                   buildSnackTemplate, buildMealsFromTemplates
src/lib/dietConfig.js → barrel re-export (compatibilidad total hacia atrás)
```

**Compatibilidad:** `dietConfig.js` re-exporta todo con los mismos nombres.
Ningún archivo existente necesita cambiar sus imports.

**BENEFICIO:** Cada módulo tiene una razón de cambio. Si cambia el sistema de plantillas
de menú, solo se toca `templates.js`. Si cambia el diseño visual de las dietas, solo `constants.js`.
Testeable de forma independiente.

```bash
git add src/lib/diet/ src/lib/dietConfig.js
git commit -m "refactor(lib): split dietConfig into constants, utils, templates modules (SRP)"
```

### ✅ Refactor 4: `ProPatientDetail.jsx` 870 → ~100 líneas + 5 tabs extraídos

**Antes:** God Component con 7 sub-componentes definidos en el mismo archivo.
Imposible testear `WeightTab` sin renderizar `OverviewTab`, `DietTab`, etc.

**Después — arquitectura de tabs:**
```
src/pages/pro/
  ProPatientDetail.jsx          ← Shell: carga patient, header, tab navigation (~100 líneas)

src/components/pro/
  tabs/
    OverviewTab.jsx             ← Visualización general (no hace fetch)
    DietTab.jsx                 ← Gestión dieta semanal (llama RPCs)
    WeightTab.jsx               ← Historial de peso (CRUD nm_weight_records)
    MedsTab.jsx                 ← Medicación (CRUD nm_medications)
    AccessTab.jsx               ← Código de acceso (generar/bloquear)
  helpers/
    index.jsx                   ← InfoItem, FamilyItem, LevelBar, MedRow
```

**Error handling añadido en TODOS los tabs:**
- `loadRecords`, `loadMeds`, `loadAll`, `loadBase` → envueltos en try/catch
- Errores de Supabase (`.error`) verificados con `if (error) throw error`
- Estado `error` local en cada tab con mensaje visible al usuario
- Console.error con contexto `[TabName]` para debugging

**BENEFICIO:** Cada tab es independiente, testeable, con su propio estado de error.
Cambiar la UI de WeightTab no tiene riesgo de romper DietTab.

```bash
git add src/components/pro/ src/pages/pro/ProPatientDetail.jsx
git commit -m "refactor(pro): extract ProPatientDetail tabs to separate components, add error handling (SRP)"
```

---

## Bugs Resueltos

### ✅ Bug 1 — `DietTab.jsx`: `handleAssignBase` no notificaba al componente padre

**Causa raíz:** `handleAssignBase` hacía `loadWeekly()` y `loadBase()` internamente (el tab se actualizaba
correctamente), pero nunca llamaba a `onUpdate()`. Si `ProPatientDetail` derivara datos de `patient.diet_type`
o necesitara refrescar el objeto paciente tras asignar una dieta base, no lo haría.

**Fix aplicado (línea 84 de DietTab.jsx):**
```javascript
// Antes: solo recargaba datos del tab
await Promise.all([loadWeekly(), loadBase()])

// Después: también notifica al padre para que recargue nm_patients
await Promise.all([loadWeekly(), loadBase()])
onUpdate()  // ← añadido
```

---

### ✅ Bug 2 — `PatientChat.jsx`: registro huérfano si la Edge Function falla

**Causa raíz:** La persistencia del mensaje del usuario en `nm_chat_messages` ocurría **antes** del bloque `try{}`.
Si la Edge Function fallaba (error de red, 500, timeout), el mensaje del usuario quedaba persistido en BD
sin ninguna respuesta asociada. El historial del chat mostraría mensajes sin respuesta del asistente.

**Fix aplicado — patrón "persistir solo tras éxito confirmado":**
```javascript
// ANTES (patrón incorrecto):
// 1. Escribe mensaje usuario en BD  ← ANTES del try, sin confirmación de éxito
// 2. Llama Edge Function
// 3. Si Edge falla → catch → mensaje usuario en BD sin respuesta = REGISTRO HUÉRFANO

// DESPUÉS (patrón correcto):
// 1. Muestra mensaje en UI (optimista, sin BD)
// 2. Llama Edge Function
// 3. Si Edge falla → catch → nada escrito en BD (UI muestra error, historial limpio)
// 4. Si Edge tiene éxito → persiste AMBOS mensajes en paralelo con Promise.all
if (convId) {
  const [{ error: userErr }, { error: assistantErr }] = await Promise.all([
    supabase.from('nm_chat_messages').insert({ ..., role: 'user', content: text }),
    supabase.from('nm_chat_messages').insert({ ..., role: 'assistant', content: reply }),
  ])
}
```

**Beneficio adicional:** Los dos inserts se hacen en paralelo (`Promise.all`) en vez de secuenciales,
reduciendo la latencia de escritura en BD.

---

## Checklist Post-Sesión

- [x] 0 placeholders (`...` como código omitido) en ningún archivo
- [x] API pública de todos los módulos preservada (dietConfig barrel re-export)
- [x] Todas las async functions con try/catch en operaciones críticas
- [x] SERVICE_KEY eliminado del bundle frontend
- [x] EDGE_URL derivada de variable de entorno
- [x] ProPatientDetail: interfaz de props de tabs sin cambios de firma
- [x] Bugs documentados corregidos: Bug 1 (DietTab onUpdate) + Bug 2 (PatientChat huérfanos)
- [ ] Run tests: suite completa debe pasar igual que baseline
- [ ] Linter: 0 errores nuevos (`npm run lint`)
- [ ] Commit atómico por fase (instrucciones arriba)

---

## Estructura de Commits Recomendada

```bash
# Rama de trabajo
git checkout -b refactor/security-and-structure-2026-03-05

# 1. Security fixes (N1)
git add src/lib/supabase.js
git commit -m "fix(security): remove hardcoded Supabase credentials"

git add src/pages/patient/PatientChat.jsx
git commit -m "fix(security): remove service_role key from client bundle"

# 2. Diet config split (N2)
git add src/lib/diet/ src/lib/dietConfig.js
git commit -m "refactor(lib): split dietConfig into SRP modules (constants/utils/templates)"

# 3. ProPatientDetail split (N2)
git add src/components/pro/ src/pages/pro/ProPatientDetail.jsx
git commit -m "refactor(pro): extract tab components from ProPatientDetail + add error handling"

# 4. PR a main con descripción completa de cambios
```
