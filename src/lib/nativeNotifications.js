/**
 * src/lib/nativeNotifications.js
 *
 * Capa de abstracción de notificaciones que funciona en:
 *  - Web (browser): usa Web Notifications API + ServiceWorker (si está disponible)
 *  - Capacitor nativo Android: usa @capacitor/local-notifications con scheduling exact
 *
 * Casos de uso en NutriMed:
 *  1. Recordatorio de tomar medicación a hora pautada
 *  2. Aviso de cita médica próxima (24h antes / 2h antes)
 *  3. Recordatorio diario de pesarse / registrar peso
 *
 * API pública:
 *  - requestPermission(): boolean (true si granted, false si denied)
 *  - schedule({ id, title, body, at }): registra notificación en X timestamp
 *  - cancel(id): cancela una notificación pendiente por id
 *  - cancelAll(): cancela todas las notificaciones programadas
 *  - listPending(): array de notificaciones pendientes (vacío en web)
 *
 * Por qué un wrapper:
 *  - Web Notifications NO tienen scheduling nativo: hay que mantener un setTimeout
 *    activo en el SW o programar en el servidor (web push). Para uso 100% offline
 *    en Android, @capacitor/local-notifications es la única opción real.
 *  - Mantenemos una API unificada que funcione en ambos: el código de la app
 *    (recordatorios.jsx, etc) llama schedule() sin saber qué plataforma corre.
 */

import { Capacitor } from '@capacitor/core'

const NM_NOTIFICATION_CHANNEL = 'nutrimed-recordatorios'

// ─── Solicitar permiso ─────────────────────────────────────────────────────
export async function requestPermission() {
  if (Capacitor.isNativePlatform()) {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const result = await LocalNotifications.requestPermissions()
    return result.display === 'granted'
  }

  // Web: Notification API estándar
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false
  }
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const permission = await Notification.requestPermission()
  return permission === 'granted'
}

// ─── Programar notificación ────────────────────────────────────────────────
// id: número único (32-bit int para Android local-notifications)
// at: Date | timestamp ms cuando debe dispararse
// extra: payload custom que llegará al click
export async function schedule({ id, title, body, at, extra = {} }) {
  const fireAt = at instanceof Date ? at : new Date(at)
  if (isNaN(fireAt.getTime())) {
    throw new Error('schedule: at no es una fecha válida')
  }

  if (Capacitor.isNativePlatform()) {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    // Asegurar canal de notificaciones (Android 8+ lo requiere)
    try {
      await LocalNotifications.createChannel({
        id: NM_NOTIFICATION_CHANNEL,
        name: 'Recordatorios NutriMed',
        description: 'Medicación, citas y peso',
        importance: 4, // IMPORTANCE_HIGH (sonido + cabeza arriba)
        visibility: 1, // VISIBILITY_PUBLIC
        vibration: true,
      })
    } catch {
      // Si el canal ya existe, createChannel falla silenciosamente — está bien.
    }

    await LocalNotifications.schedule({
      notifications: [{
        id: Number(id),
        title,
        body,
        schedule: { at: fireAt, allowWhileIdle: true },
        channelId: NM_NOTIFICATION_CHANNEL,
        smallIcon: 'ic_stat_notification',
        largeIcon: 'ic_launcher',
        extra,
      }],
    })
    return { ok: true, scheduled: fireAt.toISOString() }
  }

  // ─── Fallback web: setTimeout (NO sobrevive recarga de página) ─────
  const ms = fireAt.getTime() - Date.now()
  if (ms <= 0) {
    // Disparar inmediatamente
    if (Notification.permission === 'granted') {
      new Notification(title, { body, data: extra, tag: `nm-${id}` })
    }
    return { ok: true, scheduled: 'inmediato' }
  }

  // Almacenamos el timeout id para poder cancelarlo
  if (!window.__nmNotifTimeouts) window.__nmNotifTimeouts = new Map()
  const tid = setTimeout(() => {
    if (Notification.permission === 'granted') {
      new Notification(title, { body, data: extra, tag: `nm-${id}` })
    }
    window.__nmNotifTimeouts.delete(id)
  }, ms)
  window.__nmNotifTimeouts.set(id, tid)

  return { ok: true, scheduled: fireAt.toISOString() }
}

// ─── Cancelar notificación específica ──────────────────────────────────────
export async function cancel(id) {
  if (Capacitor.isNativePlatform()) {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    await LocalNotifications.cancel({ notifications: [{ id: Number(id) }] })
    return
  }
  // Web: limpiar setTimeout
  if (window.__nmNotifTimeouts?.has(id)) {
    clearTimeout(window.__nmNotifTimeouts.get(id))
    window.__nmNotifTimeouts.delete(id)
  }
}

// ─── Cancelar todas las pendientes ─────────────────────────────────────────
export async function cancelAll() {
  if (Capacitor.isNativePlatform()) {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const pending = await LocalNotifications.getPending()
    if (pending.notifications.length === 0) return
    await LocalNotifications.cancel({
      notifications: pending.notifications.map(n => ({ id: n.id })),
    })
    return
  }
  // Web
  if (window.__nmNotifTimeouts) {
    window.__nmNotifTimeouts.forEach(tid => clearTimeout(tid))
    window.__nmNotifTimeouts.clear()
  }
}

// ─── Lista de pendientes (solo nativo; web no las trackea entre sesiones) ──
export async function listPending() {
  if (Capacitor.isNativePlatform()) {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const result = await LocalNotifications.getPending()
    return result.notifications
  }
  // Web: no podemos listar — sólo lo que esté en memoria de la sesión actual
  return Array.from(window.__nmNotifTimeouts?.keys() || []).map(id => ({ id }))
}

// ─── Helper: ¿están las notificaciones disponibles en esta plataforma? ────
export function isAvailable() {
  if (Capacitor.isNativePlatform()) return true
  return typeof window !== 'undefined' && 'Notification' in window
}

// ─── Listener para taps sobre notificación (solo nativo) ──────────────────
// callback recibe el extra payload de la notificación tapeada.
export async function onNotificationTap(callback) {
  if (!Capacitor.isNativePlatform()) return () => {}
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  const handle = await LocalNotifications.addListener(
    'localNotificationActionPerformed',
    (action) => {
      callback?.(action.notification.extra || {}, action)
    }
  )
  return () => handle.remove()
}
