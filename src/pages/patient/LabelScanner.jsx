/**
 * src/pages/patient/LabelScanner.jsx
 *
 * Responsabilidad: escáner de etiquetas nutricionales asistido por IA.
 * Doble criterio de aprobación: producto en dieta semanal + azúcares ≤ 4g/100g.
 *
 * Estados: idle → preview → analyzing → result → idle
 * Imagen: ≤1024px antes de enviar (evita timeouts en EF).
 * Cámara/Galería: vía src/lib/nativeCamera.js que abstrae web vs Capacitor nativo.
 *   - Web: <input type="file" capture="environment">
 *   - Android nativo (HITO 5): @capacitor/camera Camera.getPhoto() con UX nativa.
 */

import { useState } from 'react'
import { useAuth } from '../../lib/AuthContext'
import PatientLayout from '../../components/layout/PatientLayout'
import ScannerResult from '../../components/patient/ScannerResult'
import { usePageTheme } from '../../lib/usePageTheme'
import { Camera, Image, RefreshCw, Loader2 } from 'lucide-react'
import { pickFromCamera, pickFromGallery } from '../../lib/nativeCamera'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://bpazmmbjjducdmxgfoum.supabase.co'

// ─── Estados posibles ──────────────────────────────────────────────────
// 'idle' | 'preview' | 'analyzing' | 'result'

export default function LabelScanner() {
  const { profile } = useAuth()
  const tc = usePageTheme()

  const [state, setState] = useState('idle')
  const [previewUrl, setPreviewUrl] = useState(null)
  // imageData = { base64, mimeType } listo para enviar al edge function
  const [imageData, setImageData] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  // ─── Selección de imagen vía wrapper (web o nativo según plataforma) ──
  // Recibe del wrapper { base64, mimeType, width?, height? } o null si cancela.
  // Construye el preview a partir del data URL para el WebView no perder la imagen
  // tras GC (no podemos depender de un File object: en nativo no existe).
  async function handlePick(source) {
    setError(null)
    try {
      const picked = source === 'camera'
        ? await pickFromCamera()
        : await pickFromGallery()
      if (!picked) return // usuario canceló
      const { base64, mimeType } = picked
      // Construir data URL para el preview (compatible web + nativo)
      const dataUrl = `data:${mimeType};base64,${base64}`
      setPreviewUrl(dataUrl)
      setImageData({ base64, mimeType })
      setResult(null)
      setState('preview')
    } catch (err) {
      console.error('[LabelScanner] pick error:', err)
      setError('No se pudo capturar la imagen. Inténtalo de nuevo.')
    }
  }

  // ─── Análisis ────────────────────────────────────────────────────────
  // imageData ya viene con {base64, mimeType} del wrapper — sin resize aquí.
  async function handleAnalyze() {
    if (!imageData?.base64) return
    setState('analyzing')
    setError(null)

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/nm-scanner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: imageData.base64,
          mime_type: imageData.mimeType,
          patient_id: profile.id,
        }),
      })

      if (!res.ok) throw new Error(`nm-scanner status ${res.status}`)

      const data = await res.json()
      setResult(data)
      setState('result')
    } catch (err) {
      console.error('[LabelScanner] analyze error:', err)
      setError('No se pudo conectar con el servidor. Inténtalo de nuevo.')
      setState('preview')
    }
  }

  // ─── Reset ───────────────────────────────────────────────────────────
  function handleReset() {
    // No revokeObjectURL: ahora previewUrl es un data URL, no un blob URL.
    setPreviewUrl(null)
    setImageData(null)
    setResult(null)
    setError(null)
    setState('idle')
  }

  // ─── Render ──────────────────────────────────────────────────────────
  return (
    <PatientLayout title="Scanner Etiquetas" subtitle="NutriMed">

      {/* ── Cabecera descriptiva ── */}
      <div className="mb-4 px-1">
        <p className="text-[12px] font-medium leading-relaxed" style={{ color: tc.textMuted }}>
          Fotografía la etiqueta nutricional de cualquier producto y la IA verificará si es compatible con tu dieta.
        </p>
      </div>

      {/* ── ESTADO: IDLE ── */}
      {state === 'idle' && (
        <div
          className="rounded-[22px] p-8 flex flex-col items-center gap-5"
          style={{ background: tc.cardBg, border: tc.cardBorder, boxShadow: tc.cardShadow }}
        >
          {/* Icono central */}
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{
              background: tc.isDark ? 'rgba(45,212,191,0.10)' : 'rgba(13,148,136,0.10)',
              border: `2px solid ${tc.isDark ? 'rgba(45,212,191,0.25)' : 'rgba(13,148,136,0.25)'}`,
            }}
          >
            <Camera size={34} style={{ color: tc.textAccent }} />
          </div>

          <div className="text-center">
            <p className="text-[15px] font-bold mb-1" style={{ color: tc.textPrimary }}>
              Escanear etiqueta
            </p>
            <p className="text-[12px] font-medium" style={{ color: tc.textMuted }}>
              Apunta la cámara a la tabla nutricional
            </p>
          </div>

          {/* Botones de acción */}
          <div className="flex flex-col gap-3 w-full">
            {/* Cámara: en web abre <input capture>, en nativo abre cámara del SO */}
            <button
              onClick={() => handlePick('camera')}
              className="w-full py-3.5 rounded-[14px] font-bold text-[14px] transition-all duration-200 flex items-center justify-center gap-2.5"
              style={{
                background: tc.isDark ? '#2DD4BF' : '#0D9488',
                color: '#fff',
                boxShadow: `0 4px 16px ${tc.isDark ? 'rgba(45,212,191,0.30)' : 'rgba(13,148,136,0.30)'}`,
              }}
            >
              <Camera size={18} />
              Hacer foto
            </button>

            {/* Galería: en web abre <input>, en nativo abre picker de fotos */}
            <button
              onClick={() => handlePick('gallery')}
              className="w-full py-3 rounded-[14px] font-semibold text-[13px] transition-all duration-200 flex items-center justify-center gap-2.5"
              style={{
                background: tc.cardInsetBg,
                border: tc.cardInsetBorder,
                color: tc.textSecondary,
              }}
            >
              <Image size={16} />
              Subir desde galería
            </button>
          </div>
        </div>
      )}

      {/* ── ESTADO: PREVIEW / ANALYZING ── */}
      {(state === 'preview' || state === 'analyzing') && previewUrl && (
        <div className="flex flex-col gap-4">

          {/* Preview imagen */}
          <div
            className="rounded-[22px] overflow-hidden"
            style={{
              background: tc.cardBg,
              border: tc.cardBorder,
              boxShadow: tc.cardShadow,
            }}
          >
            <img
              src={previewUrl}
              alt="Etiqueta a analizar"
              className="w-full"
              style={{ maxHeight: '320px', objectFit: 'contain', display: 'block' }}
            />

            {/* Overlay de análisis */}
            {state === 'analyzing' && (
              <div
                className="px-4 py-4 flex items-center gap-3"
                style={{
                  background: tc.isDark ? 'rgba(45,212,191,0.07)' : 'rgba(13,148,136,0.07)',
                  borderTop: `1px solid ${tc.isDark ? 'rgba(45,212,191,0.15)' : 'rgba(13,148,136,0.15)'}`,
                }}
              >
                <Loader2
                  size={18}
                  style={{ color: tc.textAccent }}
                  className="animate-spin"
                />
                <p className="text-[13px] font-semibold" style={{ color: tc.textAccent }}>
                  Analizando etiqueta…
                </p>
              </div>
            )}
          </div>

          {/* Error si hubo fallo en la llamada */}
          {error && (
            <p
              className="text-[12px] font-medium text-center px-2"
              style={{ color: tc.textDanger }}
            >
              {error}
            </p>
          )}

          {/* Botones de preview */}
          {state === 'preview' && (
            <div className="flex gap-3">
              {/* Botón cambiar foto */}
              <button
                onClick={handleReset}
                className="flex-1 py-3 rounded-[14px] font-semibold text-[13px] flex items-center justify-center gap-2"
                style={{
                  background: tc.cardInsetBg,
                  border: tc.cardInsetBorder,
                  color: tc.textSecondary,
                }}
              >
                <RefreshCw size={15} />
                Cambiar
              </button>

              {/* Botón analizar */}
              <button
                onClick={handleAnalyze}
                className="flex-[2] py-3 rounded-[14px] font-bold text-[14px] flex items-center justify-center gap-2.5"
                style={{
                  background: tc.isDark ? '#2DD4BF' : '#0D9488',
                  color: '#fff',
                  boxShadow: `0 4px 16px ${tc.isDark ? 'rgba(45,212,191,0.30)' : 'rgba(13,148,136,0.30)'}`,
                }}
              >
                <Camera size={17} />
                Analizar
              </button>
            </div>
          )}

          {/* Botones desactivados durante análisis */}
          {state === 'analyzing' && (
            <div className="flex gap-3">
              <button
                disabled
                className="flex-1 py-3 rounded-[14px] font-semibold text-[13px]"
                style={{ background: tc.cardInsetBg, border: tc.cardInsetBorder, color: tc.textFaint, opacity: 0.5 }}
              >
                Cambiar
              </button>
              <button
                disabled
                className="flex-[2] py-3 rounded-[14px] font-bold text-[14px] flex items-center justify-center gap-2.5"
                style={{
                  background: tc.isDark ? 'rgba(45,212,191,0.30)' : 'rgba(13,148,136,0.30)',
                  color: '#fff',
                  opacity: 0.6,
                }}
              >
                <Loader2 size={17} className="animate-spin" />
                Analizando…
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── ESTADO: RESULT ── */}
      {state === 'result' && result && (
        <div className="flex flex-col gap-4">

          {/* Resultado */}
          <ScannerResult
            allowed={result.allowed}
            reason={result.reason}
            sugar_g_per_100={result.sugar_g_per_100}
            threshold={result.threshold}
            product_category={result.product_category}
            matched_food={result.matched_food}
            confidence={result.confidence}
          />

          {/* Preview en miniatura */}
          {previewUrl && (
            <div
              className="rounded-[14px] overflow-hidden"
              style={{ border: tc.cardBorder }}
            >
              <img
                src={previewUrl}
                alt="Etiqueta analizada"
                className="w-full"
                style={{ maxHeight: '180px', objectFit: 'contain', display: 'block' }}
              />
            </div>
          )}

          {/* Botón escanear otro */}
          <button
            onClick={handleReset}
            className="w-full py-3.5 rounded-[14px] font-bold text-[14px] flex items-center justify-center gap-2.5"
            style={{
              background: tc.isDark ? '#2DD4BF' : '#0D9488',
              color: '#fff',
              boxShadow: `0 4px 16px ${tc.isDark ? 'rgba(45,212,191,0.30)' : 'rgba(13,148,136,0.30)'}`,
            }}
          >
            <Camera size={17} />
            Escanear otro producto
          </button>
        </div>
      )}

    </PatientLayout>
  )
}
