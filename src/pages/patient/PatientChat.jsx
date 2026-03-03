import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'
import PatientLayout from '../../components/layout/PatientLayout'
import { Send, Bot, User, Sparkles } from 'lucide-react'

const EDGE_URL = 'https://bpazmmbjjducdmxgfoum.supabase.co/functions/v1/nm-chat'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwYXptbWJqamR1Y2RteGdmb3VtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzgyNjUxOSwiZXhwIjoyMDgzNDAyNTE5fQ.PjLurJh6Mv4FCckyz1Fo9FasSskxosZfqUAuMgA8Yak'

/* Neumorphic styles */
const NEU_CARD = {
  background: 'linear-gradient(145deg, #262B34, #1F232B)',
  border: '1px solid rgba(255,255,255,0.04)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.35), -4px -4px 12px rgba(255,255,255,0.025), inset 1px 1px 0 rgba(255,255,255,0.06)',
}

export default function PatientChat() {
  const { profile } = useAuth()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [convId, setConvId] = useState(null)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])
  useEffect(() => { if (profile?.id) loadOrCreateConversation() }, [profile?.id])

  async function loadOrCreateConversation() {
    const { data: existing } = await supabase.from('nm_chat_conversations').select('id').eq('patient_id', profile.id).order('created_at', { ascending: false }).limit(1)
    if (existing?.length) {
      setConvId(existing[0].id)
      const { data: msgs } = await supabase.from('nm_chat_messages').select('*').eq('conversation_id', existing[0].id).order('created_at', { ascending: true })
      if (msgs?.length) setMessages(msgs.map(m => ({ id: m.id, role: m.role, content: m.content })))
    } else {
      const { data: newConv } = await supabase.from('nm_chat_conversations').insert({ patient_id: profile.id, title: 'Chat nutricional' }).select().single()
      if (newConv) setConvId(newConv.id)
    }
  }

  async function handleSend(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    const userMsg = { id: Date.now(), role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    if (convId) await supabase.from('nm_chat_messages').insert({ conversation_id: convId, role: 'user', content: text })

    try {
      const apiMessages = [...messages, userMsg].slice(-10).map(m => ({ role: m.role, content: m.content }))
      const response = await fetch(EDGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ messages: apiMessages, patient_context: { patient_id: profile.id } }),
      })
      const data = await response.json()
      const botText = data?.content || data?.message || data?.response || 'Lo siento, no he podido procesar tu consulta. Inténtalo de nuevo.'
      const botMsg = { id: Date.now() + 1, role: 'assistant', content: botText }
      setMessages(prev => [...prev, botMsg])
      if (convId) await supabase.from('nm_chat_messages').insert({ conversation_id: convId, role: 'assistant', content: botText })
    } catch {
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'assistant', content: 'Error de conexión. Comprueba tu conexión e inténtalo de nuevo.' }])
    } finally { setLoading(false); inputRef.current?.focus() }
  }

  return (
    <PatientLayout title="Chat nutricional">
      {/* Disclaimer */}
      <div className="flex items-start gap-2.5 p-3.5 rounded-2xl mb-4"
        style={{ ...NEU_CARD, borderRadius: 18, padding: 14, boxShadow: '4px 4px 12px rgba(0,0,0,0.3), -3px -3px 8px rgba(255,255,255,0.02), inset 1px 1px 0 rgba(255,255,255,0.05), 0 0 16px rgba(45,212,191,0.03)' }}>
        <Sparkles size={13} style={{ color: '#2DD4BF', marginTop: 2, flexShrink: 0, filter: 'drop-shadow(0 0 4px rgba(45,212,191,0.4))' }} />
        <p className="text-[11px] leading-relaxed" style={{ color: '#64748B' }}>
          Asistente nutricional orientativo. No sustituye la consulta profesional. Para urgencias o ajuste de medicación, contacta directamente con tu profesional.
        </p>
      </div>

      {/* Messages */}
      <div className="space-y-3 mb-4" style={{ minHeight: 200 }}>
        {messages.length === 0 && !loading && (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
              style={{
                background: 'linear-gradient(145deg, #262B34, #1F232B)',
                boxShadow: '6px 6px 16px rgba(0,0,0,0.35), -4px -4px 12px rgba(255,255,255,0.025), inset 1px 1px 0 rgba(255,255,255,0.06), 0 0 20px rgba(45,212,191,0.04)',
              }}>
              <Bot size={26} style={{ color: '#2DD4BF', filter: 'drop-shadow(0 0 6px rgba(45,212,191,0.3))' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: '#94A3B8' }}>Pregúntame sobre tu dieta, recetas o nutrición</p>
            <p className="text-[11px] mt-1" style={{ color: '#4A5568' }}>Estoy aquí para ayudarte</p>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-1"
                style={{
                  background: 'linear-gradient(145deg, #2A3040, #222830)',
                  boxShadow: '3px 3px 8px rgba(0,0,0,0.3), -2px -2px 6px rgba(255,255,255,0.02), inset 1px 1px 0 rgba(255,255,255,0.06), 0 0 10px rgba(45,212,191,0.05)',
                }}>
                <Bot size={14} style={{ color: '#2DD4BF' }} />
              </div>
            )}
            <div className="max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed"
              style={msg.role === 'user' ? {
                background: 'linear-gradient(135deg, #2DD4BF, #0D9488)',
                color: '#042F2E',
                borderBottomRightRadius: 6,
                boxShadow: '0 4px 16px rgba(45,212,191,0.25), inset 0 1px 0 rgba(255,255,255,0.2)',
                fontWeight: 500,
              } : {
                ...NEU_CARD,
                borderRadius: 18,
                borderBottomLeftRadius: 6,
                color: '#CBD5E1',
              }}>
              {msg.content}
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-1"
                style={{
                  background: 'linear-gradient(145deg, #2A3040, #222830)',
                  boxShadow: '3px 3px 8px rgba(0,0,0,0.3), -2px -2px 6px rgba(255,255,255,0.02), inset 1px 1px 0 rgba(255,255,255,0.06)',
                }}>
                <User size={14} style={{ color: '#94A3B8' }} />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(145deg, #2A3040, #222830)', boxShadow: '3px 3px 8px rgba(0,0,0,0.3), -2px -2px 6px rgba(255,255,255,0.02), inset 1px 1px 0 rgba(255,255,255,0.06)' }}>
              <Bot size={14} style={{ color: '#2DD4BF' }} />
            </div>
            <div className="rounded-2xl px-4 py-3" style={{ ...NEU_CARD, borderRadius: 18, borderBottomLeftRadius: 6 }}>
              <div className="flex gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#2DD4BF', boxShadow: '0 0 6px rgba(45,212,191,0.4)', animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#2DD4BF', boxShadow: '0 0 6px rgba(45,212,191,0.4)', animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#2DD4BF', boxShadow: '0 0 6px rgba(45,212,191,0.4)', animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Input bar — Frosted metallic */}
      <div className="sticky bottom-16 pb-2 pt-2.5 -mx-4 px-4"
        style={{
          background: 'rgba(26,29,35,0.88)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255,255,255,0.04)',
        }}>
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            className="input flex-1 !py-2.5 !px-4 text-sm"
            placeholder="Escribe tu consulta..."
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={loading}
            style={{
              borderRadius: 100,
              background: 'linear-gradient(145deg, #1A1D23, #1E2128)',
              boxShadow: 'inset 3px 3px 6px rgba(0,0,0,0.3), inset -2px -2px 4px rgba(255,255,255,0.025)',
              border: '1px solid rgba(255,255,255,0.04)',
            }}
          />
          <button type="submit" disabled={loading || !input.trim()} className="btn btn-primary !rounded-full !p-3">
            <Send size={16} />
          </button>
        </form>
      </div>
    </PatientLayout>
  )
}
