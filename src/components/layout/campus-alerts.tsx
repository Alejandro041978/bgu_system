'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell, AlertTriangle } from 'lucide-react'

interface Aviso {
  aula_id: number
  aula: string | null
  motivo: string | null
  dias: number
  matriculados: number
  notas_ya_importadas: number
}

// ---------------------------------------------------------------------------
// Campana de la cabecera. Avisa de las aulas que dejaron de sincronizar.
//
// Va en todas las pantallas a propósito: quien lo ve casi nunca es quien lo
// arregla, pero sí puede avisarle a quien sí. Un aula que deja de traer notas
// no se nota hasta que un estudiante reclama, y para entonces ya pasaron
// semanas.
// ---------------------------------------------------------------------------
export function CampusAlerts() {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [congeladas, setCongeladas] = useState(0)
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let vivo = true
    const traer = async () => {
      try {
        const r = await fetch('/api/alerts/campus', { cache: 'no-store' })
        const j = await r.json()
        if (!vivo) return
        setAvisos(j.avisos ?? [])
        setCongeladas(j.congeladas ?? 0)
      } catch { /* la campana no rompe la página */ }
    }
    traer()
    const t = setInterval(traer, 5 * 60 * 1000)
    return () => { vivo = false; clearInterval(t) }
  }, [])

  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [])

  const n = avisos.length
  return (
    <div className="relative" ref={caja}>
      <button onClick={() => setAbierto(v => !v)}
        title={n ? `${n} aula${n > 1 ? 's' : ''} sin sincronizar` : 'Sin avisos del campus'}
        className="relative p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
        <Bell className="w-5 h-5" />
        {n > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 min-w-[1.15rem] rounded-full px-1 text-[11px] font-semibold leading-[1.15rem] text-white ${congeladas > 0 ? 'bg-red-600' : 'bg-amber-500'}`}>
            {n > 99 ? '99+' : n}
          </span>
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 z-50 mt-2 w-[26rem] rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-semibold text-gray-900">Aulas que no están sincronizando</p>
            <p className="mt-0.5 text-xs text-gray-500">
              {n === 0
                ? 'Todo el campus está trayendo notas con normalidad.'
                : 'No cumplen la auditoría, así que el ERP no les trae notas. Hay que corregirlas en Moodle.'}
            </p>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {avisos.map(a => (
              <div key={a.aula_id} className="border-b border-gray-50 px-4 py-2.5 last:border-0">
                <div className="flex items-start gap-2">
                  {a.notas_ya_importadas > 0 && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />}
                  <div className="min-w-0">
                    <p className="truncate text-sm text-gray-800">
                      <span className="font-mono text-xs text-gray-500">{a.aula_id}</span> · {a.aula}
                    </p>
                    <p className="text-xs text-gray-600">{a.motivo}</p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {a.dias === 0 ? 'detectado hoy' : `${a.dias} día${a.dias > 1 ? 's' : ''} así`}
                      {a.matriculados > 0 && ` · ${a.matriculados} alumnos`}
                      {a.notas_ya_importadas > 0 && ` · ${a.notas_ya_importadas} notas congeladas`}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            {n === 0 && <p className="px-4 py-6 text-center text-sm text-gray-400">Sin avisos</p>}
          </div>

          {n > 0 && (
            <Link href="/reports/auditor-campus" onClick={() => setAbierto(false)}
              className="block border-t border-gray-100 px-4 py-2.5 text-center text-sm text-blue-600 hover:bg-gray-50">
              Ver el auditor del campus
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
