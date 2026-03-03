import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'
import PatientLayout from '../../components/layout/PatientLayout'
import { Send, Bot, User, Sparkles, AlertCircle } from 'lucide-react'

export default function PatientChat() {
  const { profile } = useAuth()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState(null)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { if (profile?.id) loadOrCreateConversation() }, [profile?.id])
  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function loadOrCreateConversation() {
    // Find active conversation or create one
    const { data: convs } = await supabase
      .from('nm_chat_conversations')
      .select('*')
      .eq('patient_id', profile.id)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)

    let convId
    if (convs?.length > 0) {
      convId = convs[0].id
    } else {
      const { data: newConv } = await supabase
        .from('nm_chat_conversations')
        .insert({ patient_id: profile.id, title: 'Consulta nutricional' })
        .select()
        .single()
      convId = newConv.id
    }
    setConversationId(convId)

    // Load messages
    const { data: msgs } = await supabase
      .from('nm_chat_messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
    setMessages(msgs || [])
  }

  async function handleSend(e) {
    e?.preventDefault()
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setLoading(true)

    // Save user message
    const userMsg = { conversation_id: conversationId, role: 'user', content: text }
    const { data: savedUser } = await supabase.from('nm_chat_messages').insert(userMsg).select().single()
    setMessages(prev => [...prev, savedUser])

    try {
      // Call AI — using Anthropic directly via Edge Function or fallback to local response
      const response = await supabase.functions.invoke('nm-chat', {
        body: {
          messages: [...messages, savedUser].map(m => ({ role: m.role, content: m.content })),
          patient_context: {
            patient_id: profile.id,
            name: profile.full_name,
            current_weight: profile.current_weight,
            target_weight: profile.target_weight,
            initial_weight: profile.initial_weight,
          }
        }
      })

      const aiContent = response.data?.content || response.data?.message || 'Lo siento, no he podido procesar tu consulta. Inténtalo de nuevo.'

      // Save assistant message
      const { data: savedAi } = await supabase
        .from('nm_chat_messages')
        .insert({ conversation_id: conversationId, role: 'assistant', content: aiContent })
        .select()
        .single()
      setMessages(prev => [...prev, savedAi])
    } catch (err) {
      // Fallback if Edge Function not deployed yet
      const fallback = getFallbackResponse(text)
      const { data: savedFallback } = await supabase
        .from('nm_chat_messages')
        .insert({ conversation_id: conversationId, role: 'assistant', content: fallback })
        .select()
        .single()
      setMessages(prev => [...prev, savedFallback])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  return (
    <PatientLayout title="Chat nutricional" subtitle="Asistente IA">
      {/* Disclaimer */}
      <div className="flex items-start gap-2.5 p-3.5 rounded-2xl mb-4" style={{ background: 'linear-gradient(135deg, #F0FDFA 0%, #E8F8F5 100%)', border: '1px solid rgba(13,148,136,0.08)' }}>
        <Sparkles size={13} className="text-teal-500 mt-0.5 shrink-0" style={{ filter: 'drop-shadow(0 1px 2px rgba(13,148,136,0.2))' }} />
        <p className="text-[11px] text-teal-700/70 leading-relaxed">
          Asistente nutricional orientativo. No sustituye la consulta profesional. Para urgencias o ajuste de medicación, contacta directamente con tu profesional.
        </p>
      </div>

      {/* Messages */}
      <div className="space-y-3 mb-4" style={{ minHeight: 200 }}>
        {messages.length === 0 && !loading && (
          <div className="text-center py-12">
            <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #F0FDFA 0%, #E0F2F1 100%)', boxShadow: '0 2px 12px rgba(13,148,136,0.08)' }}>
              <Bot size={24} className="text-teal-400" />
            </div>
            <p className="text-sm text-gray-400 font-medium">Pregúntame sobre tu dieta, recetas o nutrición</p>
            <p className="text-[11px] text-gray-300 mt-1">Estoy aquí para ayudarte</p>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-1" style={{ background: 'linear-gradient(135deg, #E0F2F1 0%, #B2DFDB 100%)', boxShadow: '0 1px 4px rgba(13,148,136,0.12)' }}>
                <Bot size={13} className="text-teal-600" />
              </div>
            )}
            <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'text-white rounded-br-md'
                : 'bg-white text-gray-800 rounded-bl-md'
            }`} style={msg.role === 'user'
              ? { background: 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)', boxShadow: '0 2px 8px rgba(13,148,136,0.2)' }
              : { boxShadow: '0 1px 6px rgba(0,0,0,0.04)', border: '1px solid rgba(13,148,136,0.05)' }
            }>
              {msg.content}
            </div>
            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-1" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <User size={13} className="text-gray-400" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #E0F2F1 0%, #B2DFDB 100%)' }}>
              <Bot size={13} className="text-teal-600" />
            </div>
            <div className="bg-white rounded-2xl rounded-bl-md px-4 py-3" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.04)', border: '1px solid rgba(13,148,136,0.05)' }}>
              <div className="flex gap-1.5">
                <span className="w-1.5 h-1.5 bg-teal-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-teal-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-teal-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Input */}
      <div className="sticky bottom-16 pb-2 pt-2 -mx-4 px-4" style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(16px)', borderTop: '1px solid rgba(13,148,136,0.05)' }}>
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            className="input flex-1 !rounded-full !py-2.5 !px-4 text-sm"
            placeholder="Escribe tu consulta..."
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={loading}
            style={{ background: '#F7FAF9', border: '1.5px solid rgba(13,148,136,0.1)' }}
          />
          <button type="submit" disabled={loading || !input.trim()} className="btn btn-primary !rounded-full !p-3">
            <Send size={16} />
          </button>
        </form>
      </div>
    </PatientLayout>
  )
}

// Fallback responses when Edge Function is not deployed
function getFallbackResponse(question) {
  const q = question.toLowerCase()
  if (q.includes('agua') || q.includes('beber')) return 'Se recomienda beber entre 1.5 y 2 litros de agua al día. Puedes incluir infusiones sin azúcar. Recuerda que esta recomendación es general — consulta con tu profesional para una pauta personalizada.'
  if (q.includes('ejercicio') || q.includes('deporte')) return 'El ejercicio complementa tu plan nutricional. Caminar 30 minutos al día es un buen punto de partida. Tu profesional puede ajustar la recomendación según tu situación.'
  if (q.includes('peso') || q.includes('bajar')) return 'La pérdida de peso saludable es gradual — entre 0.5 y 1 kg por semana es un ritmo adecuado. Sigue tu plan de dieta asignado y registra tu peso regularmente para ver la evolución.'
  if (q.includes('hambre') || q.includes('ansiedad')) return 'Es normal sentir hambre los primeros días de un cambio dietético. Asegúrate de comer en los horarios establecidos y no saltarte comidas. Si persiste, coméntalo con tu profesional.'
  return 'Gracias por tu consulta. Para darte una respuesta precisa, te recomiendo comentar este tema directamente con tu profesional en la próxima consulta. El asistente IA estará disponible próximamente con respuestas más detalladas.'
}
