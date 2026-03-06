import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'
import PatientLayout from '../../components/layout/PatientLayout'
import { usePageTheme } from '../../lib/usePageTheme'
import { Send, Bot, User } from 'lucide-react'

// EDGE_URL hardcodeada — los Build ARGs de Dokploy no se inyectan en Vite en build time
const EDGE_URL  = 'https://bpazmmbjjducdmxgfoum.supabase.co/functions/v1/nm-chat'
// ANON_KEY hardcodeada por el mismo motivo — es pública por diseño (Supabase + RLS)
// La SERVICE_ROLE_KEY fue eliminada: la Edge Function usa su propia SERVICE_ROLE_KEY
// como variable de entorno del servidor, nunca expuesta al cliente.
const ANON_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwYXptbWJqamR1Y2RteGdmb3VtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4MjY1MTksImV4cCI6MjA4MzQwMjUxOX0.uZd2m7JMXd_i-bZVsTQTcqTEhJMxLXwvdPLK74h07Kw'

export default function PatientChat() {
  const { profile } = useAuth()
  const tc = usePageTheme()
  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [convId, setConvId]     = useState(null)
  const [error, setError]       = useState(null)
  const scrollRef = useRef(null)
  const inputRef  = useRef(null)

  /* ── Estilos dinámicos ── */
  const avatarBotStyle = {
    background: tc.isDark
      ? 'linear-gradient(145deg, #2A3040, #222830)'
      : 'linear-gradient(145deg, #EEF3FF, #E5EDFF)',
    boxShadow: tc.isDark
      ? '3px 3px 8px rgba(0,0,0,0.3), -2px -2px 6px rgba(255,255,255,0.02), inset 1px 1px 0 rgba(255,255,255,0.06)'
      : '3px 3px 8px rgba(163,180,210,0.40), -2px -2px 6px rgba(255,255,255,0.85), inset 1px 1px 0 rgba(255,255,255,0.95)',
  }
  const avatarUserStyle = {
    background: tc.isDark
      ? 'linear-gradient(145deg, #2A3040, #222830)'
      : 'linear-gradient(145deg, #F5F8FF, #ECF2FF)',
    boxShadow: avatarBotStyle.boxShadow,
  }
  const bubbleBotStyle = {
    background: tc.cardBg,
    border: tc.cardBorder,
    boxShadow: tc.cardShadow,
    borderRadius: 18,
    borderBottomLeftRadius: 6,
    color: tc.textBody,
    fontWeight: 500,
  }
  const inputBarStyle = {
    background: tc.isDark ? 'rgba(26,29,35,0.90)' : 'rgba(232,236,242,0.92)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderTop: `1px solid ${tc.divider}`,
  }
  const inputFieldStyle = {
    borderRadius: 100,
    background: tc.cardInsetBg,
    boxShadow: tc.cardInsetShadow,
    border: tc.cardInsetBorder,
    color: tc.textPrimary,
  }

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])
  useEffect(() => { if (profile?.id) loadOrCreateConversation() }, [profile?.id])

  async function loadOrCreateConversation() {
    try {
      const { data: existing, error: err1 } = await supabase
        .from('nm_chat_conversations').select('id')
        .eq('patient_id', profile.id).order('created_at', { ascending: false }).limit(1)
      if (err1) throw err1

      if (existing?.length) {
        setConvId(existing[0].id)
        const { data: msgs, error: err2 } = await supabase.from('nm_chat_messages').select('*')
          .eq('conversation_id', existing[0].id).order('created_at', { ascending: true })
        if (err2) throw err2
        if (msgs?.length) setMessages(msgs.map(m => ({ id: m.id, role: m.role, content: m.content })))
      } else {
        const { data: newConv, error: err3 } = await supabase.from('nm_chat_conversations')
          .insert({ patient_id: profile.id, title: 'Chat nutricional' }).select().single()
        if (err3) throw err3
        if (newConv) setConvId(newConv.id)
      }
    } catch (err) {
      console.error('[PatientChat] loadOrCreateConversation error:', err)
      setError('No se pudo cargar el historial del chat.')
    }
  }

  async function handleSend(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setError(null)

    // UI optimista: el mensaje aparece inmediatamente.
    // La persistencia en BD ocurre SOLO tras confirmar respuesta correcta de la Edge Function
    // — evita mensajes huérfanos (usuario sin respuesta) cuando la función falla.
    const userMsg = { id: Date.now(), role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const res = await fetch(EDGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
        body: JSON.stringify({
          message: text,
          patient_id: profile.id,
          conversation_history: messages.map(m => ({ role: m.role, content: m.content })),
        }),
      })

      if (!res.ok) {
        const errBody = await res.text()
        throw new Error(`Edge Function error ${res.status}: ${errBody}`)
      }

      const data  = await res.json()
      const reply = data?.content || data?.message || data?.response || 'Sin respuesta del asistente.'
      const assistantMsg = { id: Date.now() + 1, role: 'assistant', content: reply }
      setMessages(prev => [...prev, assistantMsg])

      // NOTA: La persistencia en nm_chat_messages la gestiona la Edge Function
      // cuando recibe { message, patient_id } (isDirectCall=true).
      // El frontend NO persiste por separado para evitar duplicados.
    } catch (err) {
      console.error('[PatientChat] handleSend error:', err)
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'assistant',
        content: 'Error de conexión. Inténtalo de nuevo.',
      }])
    }

    setLoading(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  return (
    <PatientLayout title="Asistente nutricional">
      {error && (
        <div className="mb-3 px-4 py-2.5 rounded-xl text-xs font-medium"
          style={{ background: 'rgba(248,113,113,0.08)', color: '#FB7185', border: '1px solid rgba(248,113,113,0.2)' }}>
          {error}
        </div>
      )}
      {/* Área de mensajes */}
      <div className="space-y-3 pb-4 min-h-[calc(100vh-200px)]">
        {messages.length === 0 && !loading && (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
              style={{ background: tc.isDark ? 'rgba(45,212,191,0.08)' : 'rgba(13,148,136,0.08)', border: `1px solid ${tc.textAccent}25` }}>
              <Bot size={28} style={{ color: tc.textAccent }} />
            </div>
            <p className="text-sm font-semibold mb-1" style={{ color: tc.textPrimary }}>
              Hola, {profile?.full_name?.split(' ')[0] || 'paciente'}
            </p>
            <p className="text-xs font-medium" style={{ color: tc.textMuted }}>
              Soy tu asistente nutricional. Pregúntame sobre tu dieta.
            </p>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-2.5 items-end ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {/* Avatar */}
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-1"
              style={msg.role === 'user' ? avatarUserStyle : avatarBotStyle}>
              {msg.role === 'user'
                ? <User size={14} style={{ color: tc.textAccent }} />
                : <Bot size={14}  style={{ color: tc.textAccent }} />}
            </div>

            {/* Burbuja */}
            <div className="max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed"
              style={msg.role === 'user' ? {
                background: 'linear-gradient(135deg, #2DD4BF, #0D9488)',
                color: '#042F2E',
                borderBottomRightRadius: 6,
                boxShadow: '0 4px 16px rgba(45,212,191,0.25), inset 0 1px 0 rgba(255,255,255,0.2)',
                fontWeight: 600,
              } : bubbleBotStyle}>
              {msg.content}
            </div>
          </div>
        ))}

        {/* Indicador typing */}
        {loading && (
          <div className="flex gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={avatarBotStyle}>
              <Bot size={14} style={{ color: tc.textAccent }} />
            </div>
            <div className="rounded-2xl px-4 py-3"
              style={{ background: tc.cardBg, border: tc.cardBorder, boxShadow: tc.cardShadow, borderRadius: 18, borderBottomLeftRadius: 6 }}>
              <div className="flex gap-1.5">
                {[0, 150, 300].map(delay => (
                  <span key={delay} className="w-1.5 h-1.5 rounded-full animate-bounce"
                    style={{ background: tc.textAccent, boxShadow: `0 0 6px ${tc.textAccent}60`, animationDelay: `${delay}ms` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Input bar */}
      <div className="sticky bottom-16 pb-2 pt-2.5 -mx-4 px-4" style={inputBarStyle}>
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            className="input flex-1 !py-2.5 !px-4 text-sm"
            placeholder="Escribe tu consulta..."
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={loading}
            style={inputFieldStyle}
          />
          <button type="submit" disabled={loading || !input.trim()} className="btn btn-primary !rounded-full !p-3">
            <Send size={16} />
          </button>
        </form>
      </div>
    </PatientLayout>
  )
}
