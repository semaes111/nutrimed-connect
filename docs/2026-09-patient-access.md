# Acceso de pacientes: parche y despliegue coordinado

Este documento describe código preparado y pruebas locales. No acredita una aplicación en producción.

## Comportamiento

- El acceso y la recuperación de sesión validan el código por RPC. Un `patient_id` guardado en el navegador no autoriza lecturas.
- Pesos, medicaciones, conversaciones, mensajes, comidas, dietas y lista de compra se leen por las ocho RPC del contrato 020. Ordenación, filtros y límites se conservan.
- El validador rechaza códigos ambiguos y discrepancias entre almacenes. Un bloqueo o caducidad en `nm_access_codes` no permite recurrir a `nm_patients`. Los códigos existentes solo en pacientes siguen siendo compatibles.
- Registrar peso usa una transacción en el servidor: registro e información de peso actual se guardan juntos. El paciente no puede suministrar un ID ajeno. Se conserva el rango 30–300 kg de la interfaz.
- Chat, escáner y generación de compra exigen código válido correspondiente al paciente, o un JWT de usuario verificado y profesional activo asignado a ese paciente. Un código equivocado no puede utilizar el JWT como vía alternativa. Se verifica la propiedad de la conversación antes de leerla o escribirla.
- Generación y bloqueo de códigos del profesional son atómicos. Los nuevos códigos usan UUID v4 sin guiones (32 caracteres, 122 bits aleatorios); la interfaz admite el nuevo formato. Al cambiar de profesional a paciente se cierra la sesión profesional local.
- El cierre reserva informes, limpieza e importación a integraciones de servidor. La vista de informes respeta RLS y pierde permisos públicos. La importación conserva su lógica clínica y genera códigos de 32 caracteres; el corte se cancela si la expresión revisada ha cambiado.

## Archivos y orden de despliegue

1. Ejecutar `supabase/deploy/nm_access_preflight.sql` con acceso administrativo autorizado. Solo recoge metadatos y agregados. Confirmar proyecto, tablas/columnas, políticas, códigos duplicados o discrepantes y profesionales asignados. Revisar también las vistas y todas las funciones privilegiadas relacionadas con datos clínicos.
2. Conservar una copia privada de las definiciones, permisos y políticas que vayan a cambiar. Comprobar el historial real de migraciones. El repositorio solo contiene las migraciones antiguas 001–003 y no representa todas las modificaciones de producción; **no ejecutar un `db push` indiscriminado**. La 001 antigua contiene `CREATE POLICY IF NOT EXISTS`, que PostgreSQL no admite.
3. Aplicar exclusivamente la migración aditiva `20260927192812_nm_patient_access_hardened.sql`, creada con Supabase CLI 2.118.0. Es compatible con el contrato del SQL 020 y no cierra las tablas ni cambia datos clínicos.
4. Publicar el frontend y comprobar acceso, recuperación de sesión, siete lecturas de seguimiento y registro de peso. Preparar/instalar la actualización de clientes Android antes del corte: el proyecto incluye contenido web empaquetado y tiene la actualización OTA desactivada.
5. Desplegar `nm-chat`, `nm-scanner` y `nm-shopping` con su módulo `_shared/patientAuth.ts`. Los pacientes siguen sin JWT de Supabase; el código es su credencial y se comprueba dentro de la función. Los profesionales envían su JWT. Las integraciones antiguas que solo mandan IDs tendrán que autenticarse; no deben recibir una excepción sin validación.
6. Ejecutar `supabase/deploy/nm_close_anonymous_access.sql`. Revoca permisos directos de `anon` sobre las nueve tablas y añade una prohibición restrictiva que resiste políticas permisivas heredadas. Añade restricciones por profesional asignado para `authenticated` y revoca privilegios de tabla completa como `TRUNCATE`. Revoca ejecución anónima de las cinco RPC profesionales heredadas usadas por la app y las convierte a `SECURITY INVOKER` para someterlas a RLS. Las definiciones reales inspeccionadas están en `tests/fixtures/nm-legacy-rpcs.sql`; las pruebas comprueban lectura, dieta base, excepciones por día y creación/actualización de menús. También restringe `nm_cleanup_run` y `process_form_intake` a `service_role`, y cierra la vista de informes y tres tablas de servidor. Verificar previamente que sus integraciones usen credenciales de servidor. No invocar la limpieza como prueba: elimina registros y envía notificaciones.
7. Ejecutar los asesores de seguridad de Supabase, revisar sus resultados y verificar la app y las comprobaciones negativas desde `anon`, paciente A, paciente B, usuario ajeno y profesional asignado. Para cada RPC, comparar agregados con su referencia dentro de la base sin imprimir códigos ni historiales. No crear mensajes clínicos ni consumir llamadas de IA para probar denegaciones.
8. Ejecutar una sola vez `supabase/deploy/nm_rotate_exposed_codes.sql`. Exige el cierre anterior, detecta ambigüedad y conserva el bloqueo y la fecha de caducidad más restrictiva. Invalida todos los códigos anteriores, registra la actuación y devuelve solo un contador. Distribuir los nuevos códigos mediante la consulta; este parche no envía correos ni mensajes a pacientes.

Los tres pasos que cambian producción deben coordinarse en una misma ventana. Mantener una versión antigua de la app después del cierre no es compatible. No restaurar políticas públicas como reversión: ante un fallo, corregir la app o utilizar mantenimiento temporal.

## Verificación ejecutable

```sh
npm ci
npm run lint
npm test
npm run check:dietmap
npm run check:edge-types
npm run build
```

Verificación local: 62 pruebas superadas (25 de PostgreSQL), compilación Vite correcta y ESLint sin errores (19 advertencias existentes). La comprobación de tipos de las tres funciones Edge pasa con Deno 2.9.6 y Supabase JS 2.98.0. `check:edge-types` usa la declaración Edge incluida en el SDK local porque JSR no es accesible en este entorno; los imports del SDK se fijan a la versión comprobada.

Las pruebas nuevas usan datos sintéticos. PGlite 0.5.8 ejecuta PostgreSQL con roles, permisos, funciones y RLS; no es una simulación de los predicados en JavaScript. Las pruebas cubren: resolución del código, bloqueo y caducidad en ambos almacenes, colisiones, acceso anónimo, aislamiento entre pacientes/profesionales, referencias a conversaciones ajenas, escrituras y rollback atómico, regeneración y rotación única. Los tests del cliente comprueban sesiones manipuladas, y los de las funciones Edge, credenciales y autorización antes de cualquier consulta clínica.

PGlite tiene una sola conexión: no demuestra concurrencia real de sesiones ni el comportamiento completo de PostgREST, Supabase Auth, la pasarela Edge o el frontend desplegado. Esas verificaciones se deben hacer en el proyecto autorizado antes del cierre definitivo.

## Límites que impiden declarar una auditoría completa

- Se han inspeccionado las cinco RPC profesionales en producción y probado sus cuerpos reales con datos sintéticos. El cierre también cubre la vista de informes y las funciones privilegiadas de limpieza e importación descubiertas durante la inspección. La pasarela Edge, los desencadenadores de formularios y sus integraciones requieren comprobación en el despliegue real antes de declarar el cierre completo.
- La credencial del paciente sigue siendo un secreto portador persistido por el cliente por compatibilidad. La revocación se valida en cada operación del servidor; no equivale a implantar sesiones de Supabase Auth. No reutilizar códigos expuestos.
- No se ha añadido un limitador de intentos en la pasarela. Los códigos nuevos aportan alta entropía, pero el control de abuso y la protección frente a XSS requieren una revisión específica del despliegue.
- La rotación no prueba que nadie haya accedido anteriormente. La contención y la investigación de accesos son tareas distintas.
