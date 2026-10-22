import { createClient } from '@supabase/supabase-js'

// ponytail: fallbacks deliberados — Dokploy no pasa Build ARGs a Vite (Contrato 6). NO eliminar.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://bpazmmbjjducdmxgfoum.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwYXptbWJqamR1Y2RteGdmb3VtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4MjY1MTksImV4cCI6MjA4MzQwMjUxOX0.uZd2m7JMXd_i-bZVsTQTcqTEhJMxLXwvdPLK74h07Kw'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Exports aditivos (2026-10-22): URL y anon key para las llamadas directas a Edge Functions.
// Evita duplicar la clave en cada página (PatientChat la tenía copiada a mano).
export const SUPABASE_URL      = supabaseUrl
export const SUPABASE_ANON_KEY = supabaseAnonKey
