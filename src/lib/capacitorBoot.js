/**
 * src/lib/capacitorBoot.js
 *
 * Inicialización de plugins Capacitor al arrancar la app.
 * Sólo se ejecuta cuando Capacitor.isNativePlatform() === true.
 * En web es un no-op para no aumentar bundle ni cargar plugins innecesarios.
 *
 * Tareas:
 *  1. Notificar al CapacitorUpdater que la app cargó OK (notifyAppReady)
 *     — esto es OBLIGATORIO en cada arranque o el plugin hará rollback al
 *     bundle anterior pensando que la actualización falló.
 *  2. Crear el canal de notificaciones por defecto.
 *  3. (Futuro) Verificar si hay actualización OTA disponible y aplicarla.
 */

import { Capacitor } from '@capacitor/core'

export async function bootCapacitor() {
  if (!Capacitor.isNativePlatform()) return

  // ─── 1. Notificar que la app boot OK al updater ─────────────────────
  // Sin esto, en el próximo arranque el plugin hace rollback automático
  // pensando que el último update rompió la app.
  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater')
    await CapacitorUpdater.notifyAppReady()
  } catch (err) {
    // Plugin no disponible o error — no es crítico para el funcionamiento.
    console.warn('[capacitorBoot] notifyAppReady falló:', err)
  }

  // ─── 2. Crear canal de notificaciones (idempotente) ─────────────────
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    await LocalNotifications.createChannel({
      id: 'nutrimed-recordatorios',
      name: 'Recordatorios NutriMed',
      description: 'Medicación, citas y peso',
      importance: 4,
      visibility: 1,
      vibration: true,
    }).catch(() => {/* ya existe, OK */})
  } catch (err) {
    console.warn('[capacitorBoot] createChannel falló:', err)
  }

  // ─── 3. (Futuro) Comprobar OTA ──────────────────────────────────────
  // Cuando el endpoint de updates esté listo, descomentar:
  //   const { CapacitorUpdater } = await import('@capgo/capacitor-updater')
  //   const latest = await CapacitorUpdater.getLatest()
  //   if (latest.url) await CapacitorUpdater.download({ url: latest.url, version: latest.version })
}
