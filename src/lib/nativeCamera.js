/**
 * src/lib/nativeCamera.js
 *
 * Capa de abstracción cámara/galería que funciona en:
 *  - Web (navegador móvil o desktop): usa <input type="file"> con capture="environment"
 *  - Capacitor nativo Android: usa @capacitor/camera Camera.getPhoto() con UX nativa
 *
 * Por qué un wrapper:
 *  - El código de UI (LabelScanner.jsx) NO debe saber si está en web o nativo.
 *  - En nativo, getPhoto() abre directamente la app de cámara o el picker nativo de
 *    galería, mucho más fluido que un <input> que el WebView intercepta.
 *  - Mantenemos un único call-site: pickFromCamera() / pickFromGallery() devuelven
 *    siempre {base64, mimeType, width?, height?} listo para enviar al edge function.
 *
 * El detector Capacitor.isNativePlatform() distingue WebView Android/iOS de browser web.
 * En SSR / build no tenemos acceso a Capacitor.isNativePlatform sincrono — el import dinámico
 * evita romper el build del bundle web puro.
 */

import { Capacitor } from '@capacitor/core'

const MAX_DIMENSION = 1024
const JPEG_QUALITY = 0.85

// ─── Helper: redimensionar y convertir a base64 ─────────────────────────────
// Reusado del comportamiento original de LabelScanner para mantener coherencia
// con lo que el edge function nm-scanner espera (max 1024px, jpeg 0.85).
async function resizeBlobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    const objectUrl = URL.createObjectURL(blob)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        (resizedBlob) => {
          if (!resizedBlob) {
            reject(new Error('canvas.toBlob falló'))
            return
          }
          const reader = new FileReader()
          reader.onload = () => {
            const base64 = reader.result.split(',')[1]
            resolve({ base64, mimeType: 'image/jpeg', width: w, height: h })
          }
          reader.onerror = reject
          reader.readAsDataURL(resizedBlob)
        },
        'image/jpeg',
        JPEG_QUALITY
      )
    }
    img.onerror = reject
    img.src = objectUrl
  })
}

// ─── Captura con cámara ─────────────────────────────────────────────────────
// En nativo abre la cámara del sistema. En web usa <input capture="environment">.
// Devuelve null si el usuario cancela.
export async function pickFromCamera() {
  if (Capacitor.isNativePlatform()) {
    // Importación dinámica: solo se carga el plugin en runtime nativo. En el bundle
    // web puro este import nunca se ejecuta, manteniendo el bundle ligero.
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')

    try {
      const photo = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.Base64, // base64 directo, sin pasar por filesystem
        source: CameraSource.Camera,
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        correctOrientation: true,
        promptLabelHeader: 'Escanear etiqueta',
        promptLabelCancel: 'Cancelar',
        promptLabelPhoto: 'Galería',
        promptLabelPicture: 'Cámara',
      })
      // photo.base64String YA viene redimensionado al máximo solicitado por Capacitor.
      // El edge function nm-scanner espera image_base64 + mime_type, no necesita resize aquí.
      return {
        base64: photo.base64String,
        mimeType: `image/${photo.format || 'jpeg'}`,
        // Capacitor no devuelve width/height aquí — sólo lo necesitamos en web.
      }
    } catch (err) {
      // Camera.getPhoto lanza error con message="User cancelled photos app" cuando se cancela.
      if (err && /cancel/i.test(err.message || '')) return null
      throw err
    }
  }

  // ─── Fallback web: <input type=file capture=environment> ──────────────────
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.setAttribute('capture', 'environment') // hint al sistema para abrir cámara trasera
    input.style.display = 'none'
    document.body.appendChild(input)

    const cleanup = () => {
      try { document.body.removeChild(input) } catch { /* ya removido */ }
    }

    input.onchange = async (ev) => {
      const file = ev.target.files?.[0]
      cleanup()
      if (!file) { resolve(null); return }
      try {
        const result = await resizeBlobToBase64(file)
        resolve(result)
      } catch (err) {
        reject(err)
      }
    }

    // Si el usuario cancela el diálogo, no se dispara onchange — usamos focus para detectarlo.
    const onWindowFocus = () => {
      window.removeEventListener('focus', onWindowFocus)
      // Esperar un tick para dar tiempo a que onchange dispare si seleccionó archivo.
      setTimeout(() => {
        if (document.body.contains(input)) {
          cleanup()
          resolve(null)
        }
      }, 300)
    }
    window.addEventListener('focus', onWindowFocus)

    input.click()
  })
}

// ─── Selección desde galería ────────────────────────────────────────────────
// En nativo abre el picker nativo de fotos. En web usa <input> sin capture.
export async function pickFromGallery() {
  if (Capacitor.isNativePlatform()) {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')

    try {
      const photo = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Photos,
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        correctOrientation: true,
      })
      return {
        base64: photo.base64String,
        mimeType: `image/${photo.format || 'jpeg'}`,
      }
    } catch (err) {
      if (err && /cancel/i.test(err.message || '')) return null
      throw err
    }
  }

  // ─── Fallback web: <input type=file> sin capture (abre selector de archivos) ──
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.style.display = 'none'
    document.body.appendChild(input)

    const cleanup = () => {
      try { document.body.removeChild(input) } catch { /* */ }
    }

    input.onchange = async (ev) => {
      const file = ev.target.files?.[0]
      cleanup()
      if (!file) { resolve(null); return }
      try {
        const result = await resizeBlobToBase64(file)
        resolve(result)
      } catch (err) {
        reject(err)
      }
    }

    const onWindowFocus = () => {
      window.removeEventListener('focus', onWindowFocus)
      setTimeout(() => {
        if (document.body.contains(input)) {
          cleanup()
          resolve(null)
        }
      }, 300)
    }
    window.addEventListener('focus', onWindowFocus)

    input.click()
  })
}

// ─── Helper de detección de plataforma para UI condicional ──────────────────
// Útil si el componente quiere mostrar texto distinto en nativo vs web (ej. ocultar
// el botón "subir desde galería" cuando la cámara nativa ya tiene su propio picker).
export function isNative() {
  return Capacitor.isNativePlatform()
}

export function getPlatform() {
  return Capacitor.getPlatform() // 'web', 'android', 'ios'
}
