/**
 * src/hooks/useCountdown.js
 *
 * Hook reactivo de cuenta atrás hacia una fecha objetivo.
 * Se actualiza cada segundo con setInterval.
 *
 * @param {string|null} targetDate  ISO string de la fecha objetivo
 * @returns {{ days: number, hours: number, minutes: number, seconds: number, expired: boolean, active: boolean }}
 */
import { useState, useEffect } from 'react'

function calcRemaining(target) {
  const diff = new Date(target) - new Date()
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true }
  const totalSec = Math.floor(diff / 1000)
  const days    = Math.floor(totalSec / 86400)
  const hours   = Math.floor((totalSec % 86400) / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60
  return { days, hours, minutes, seconds, expired: false }
}

export function useCountdown(targetDate) {
  const [state, setState] = useState(() => {
    if (!targetDate) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: false, active: false }
    return { ...calcRemaining(targetDate), active: true }
  })

  useEffect(() => {
    if (!targetDate) {
      setState({ days: 0, hours: 0, minutes: 0, seconds: 0, expired: false, active: false })
      return
    }
    // Cálculo inicial inmediato
    setState({ ...calcRemaining(targetDate), active: true })

    const id = setInterval(() => {
      setState({ ...calcRemaining(targetDate), active: true })
    }, 1000)

    return () => clearInterval(id)
  }, [targetDate])

  return state
}
