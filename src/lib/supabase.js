import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://bpazmmbjjducdmxgfoum.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwYXptbWJqamR1Y2RteGdmb3VtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4MjY1MTksImV4cCI6MjA4MzQwMjUxOX0.uZd2m7JMXd_i-bZVsTQTcqTEhJMxLXwvdPLK74h07Kw'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Service helper factory
export function createService(tableName) {
  return {
    async list(filters = {}, options = {}) {
      let q = supabase.from(tableName).select(options.select || '*', options.count ? { count: 'exact' } : {})
      Object.entries(filters).forEach(([k, v]) => { q = q.eq(k, v) })
      if (options.order) q = q.order(options.order.column, { ascending: options.order.ascending ?? true })
      if (options.limit) q = q.limit(options.limit)
      const { data, error, count } = await q
      if (error) throw error
      return options.count ? { data, count } : data
    },
    async getById(id) {
      const { data, error } = await supabase.from(tableName).select('*').eq('id', id).single()
      if (error) throw error
      return data
    },
    async create(record) {
      const { data, error } = await supabase.from(tableName).insert(record).select().single()
      if (error) throw error
      return data
    },
    async update(id, updates) {
      const { data, error } = await supabase.from(tableName).update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    async remove(id) {
      const { error } = await supabase.from(tableName).delete().eq('id', id)
      if (error) throw error
    },
    async upsert(record, options = {}) {
      const { data, error } = await supabase.from(tableName).upsert(record, options).select().single()
      if (error) throw error
      return data
    },
  }
}

// Pre-built services for each table
export const patientsService = createService('nm_patients')
export const professionalsService = createService('nm_professionals')
export const dietPlansService = createService('nm_diet_plans')
export const weightRecordsService = createService('nm_weight_records')
export const medicationsService = createService('nm_medications')
export const recipesService = createService('nm_recipes')
export const accessCodesService = createService('nm_access_codes')
export const chatConversationsService = createService('nm_chat_conversations')
export const chatMessagesService = createService('nm_chat_messages')
export const dietasValidasService = createService('dietas_validas')
