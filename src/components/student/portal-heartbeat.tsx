'use client'

import { useEffect } from 'react'

// Latido del portal: avisa cada minuto que el estudiante sigue conectado.
// Invisible; alimenta el "conectados ahora" del reporte de accesos.
export function PortalHeartbeat() {
  useEffect(() => {
    const beat = () => { fetch('/api/student/heartbeat', { method: 'POST' }).catch(() => {}) }
    beat()
    const t = setInterval(beat, 60_000)
    return () => clearInterval(t)
  }, [])
  return null
}
