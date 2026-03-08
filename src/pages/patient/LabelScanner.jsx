/**
 * src/pages/patient/LabelScanner.jsx
 *
 * Responsabilidad: escáner de etiquetas nutricionales asistido por IA.
 * Doble criterio de aprobación: producto en dieta semanal + azúcares ≤ 4g/100g.
 *
 * Estados: idle → preview → analyzing → result → idle
 * Imagen: se redimensiona a ≤1024px antes de enviar (evita timeouts en EF).
 * Cámara: input[type=file] capture="environment" activa cámara trasera en móvil.
 */

import { useState, useRef } from 'react'
import { useAuth } from '../../lib/AuthContext'
import PatientLayout from '../../components/layout/PatientLayout'
import ScannerResult from '../../components/patient/ScannerResult'
import { usePageTheme } from '../../lib/usePageTheme'
import { Camera, Image, RefreshCw, Loader2 } from 'lucide-react'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://bpazmmbjjducdmxgfoum.supabase.co'

// ─── Resize de imagen a ≤1024px, jpeg 0.85 ─────────────────────────────
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const MAX = 1024
      const scale = Math.min(1, MAX / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('canvas.toBlob falló')); return }
          const reader = new FileReader()
          reader.onload = () => {
            const base64 = reader.result.split(',')[1]
            resolve({ base64, mimeType: 'image/jpeg' })
          }
          reader.onerror = reject
          reader.readAsDataURL(blob)
        },
        'image/jpeg',
        0.85
      )
    }
    img.onerror = reject
    img.src = objectUrl
  })
}

// ─── Estados posibles ──────────────────────────────────────────────────
// 'idle' | 'preview' | 'analyzing' | 'result'

export default function LabelScanner() {
  const { profile } = useAuth()
  const tc = usePageTheme()

  const [state, setState] = useState('idle')
  const [previewUrl, setPreviewUrl] = useState(null)
  const [imageData, setImageData] = useState(null)  // { base64, mimeType }
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const cameraInputRef = useRef(null)
  const galleryInputRef = useRef(null)

  // ─── Selección de imagen ─────────────────────────────────────────────
  function handleFileSelected(e) {
    const file = e.target.files?.[0]
    if (!file) return
    // Limpiar input para permitir reselección del mismo archivo
    e.target.value = ''

    const preview = URL.createObjectURL(file)
    setPreviewUrl(preview)
    setImageData(null)  // se genera en el momento de analizar
    setResult(null)
    setError(null)
    setState('preview')

    // Almacenamos el archivo para procesarlo al pulsar Analizar
    setImageData({ file })
  }

  // ─── Análisis ────────────────────────────────────────────────────────
  async function handleAnalyze() {
    if (!imageData?.file) return
    setState('analyzing')
    setError(null)

    try {
      // Resize + base64
      const { base64, mimeType } = await resizeImage(imageData.file)

      const res = await fetch(`${SUPABASE_URL}/functions/v1/nm-scanner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: base64,
          mime_type: mimeType,
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
    if (previewUrl) URL.revokeObjectURL(previewUrl)
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
            {/* Cámara (activa cámara trasera en móvil) */}
            <button
              onClick={() => cameraInputRef.current?.click()}
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

            {/* Galería */}
            <button
              onClick={() => galleryInputRef.current?.click()}
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

          {/* Inputs ocultos */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileSelected}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelected}
          />
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
