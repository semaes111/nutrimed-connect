import { createContext, useContext, useState, useEffect, useCallback } from 'react'

/**
 * ThemeContext — Dark/Light mode manager
 *
 * Estrategia:
 * - Persiste en localStorage con clave 'nm_theme'
 * - Aplica data-theme="dark"|"light" en <html>
 * - Default: 'dark' (diseño original)
 * - No modifica ninguna lógica de autenticación ni Supabase
 */

const ThemeContext = createContext(null)

function safeGetTheme() {
  try { return localStorage.getItem('nm_theme') } catch { return null }
}
function safeSetTheme(value) {
  try { localStorage.setItem('nm_theme', value) } catch { /* Safari private mode */ }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const saved = safeGetTheme()
    // Validar que sea un valor válido
    if (saved === 'light' || saved === 'dark') return saved
    // Default: dark (tema original)
    return 'dark'
  })

  // Aplicar data-theme al <html> al montar y al cambiar
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    safeSetTheme(theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isDark: theme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
