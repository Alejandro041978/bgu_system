'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, ShieldCheck, ChevronDown, ChevronRight, AlertOctagon, AlertTriangle, Info } from 'lucide-react'

interface Hallazgo {
  id: string; sev: 'alta' | 'media' | 'baja'; grupo: string
  titulo: string; detalle: string; afectados: string[]; sugerencia: string
}
interface Data {
  generado: string
  resumen: { hallazgos: number; alta: number; media: number; baja: number; elementos: number }
  contexto: { objetivos: number; dimensiones: number; estrategias: number; kpis: number; medidas: number; anios: number }
  hallazgos: Hallazgo[]
}

const SEV = {
  alta:  { txt: 'Alta',  cls: 'border-red-200 bg-red-50 text-red-700',       icon: AlertOctagon },
  media: { txt: 'Media', cls: 'border-amber-200 bg-amber-50 text-amber-800', icon: AlertTriangle },
  baja:  { txt: 'Baja',  cls: 'border-sky-200 bg-sky-50 text-sky-700',       icon: Info },
}

export function PlanAudit() {
  const [d, setD] = useState<Data | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<Record<string, boolean>>({})

  const traer = async () => {
    setCargando(true); setError(null)
    try {
      const r = await fetch('/api/planning/audit', { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'No se pudo auditar')
      setD(j)
    } catch (e) { setError(String(e instanceof Error ? e.message : e)) }
    setCargando(false)
  }
  useEffect(() => { traer() }, [])

  if (cargando && !d) return <p className="text-sm text-gray-500">Revisando los tres planes…</p>
  if (error && !d) return <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>
  if (!d) return null

  const r = d.resumen

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={traer} disabled={cargando}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`} /> Volver a auditar
        </button>
        <span className="text-xs text-gray-400">
          {new Date(d.generado).toLocaleString('es-PE')} · {d.contexto.objetivos} objetivos ·{' '}
          {d.contexto.kpis} KPIs · {d.contexto.medidas} medidas
        </span>
      </div>

      {!r.hallazgos ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-800">
            <ShieldCheck className="h-4 w-4" /> Sin inconsistencias entre los tres planes.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Caja t="Hallazgos" v={r.hallazgos} d={`${r.elementos} elementos afectados`} />
            <Caja t="Severidad alta" v={r.alta} d="bloquean o distorsionan" alerta={r.alta > 0} />
            <Caja t="Severidad media" v={r.media} d="corregir antes del informe" />
            <Caja t="Severidad baja" v={r.baja} d="higiene" />
          </div>

          <div className="space-y-2">
            {d.hallazgos.map(x => {
              const s = SEV[x.sev]; const Icon = s.icon; const open = abierto[x.id]
              return (
                <div key={x.id} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                  <button onClick={() => setAbierto(p => ({ ...p, [x.id]: !p[x.id] }))}
                    className="flex w-full items-start gap-2.5 px-4 py-3 text-left hover:bg-gray-50">
                    {open ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                          : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />}
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium text-gray-900">
                        <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10.5px] ${s.cls}`}>
                          <Icon className="h-3 w-3" />{s.txt}
                        </span>
                        {x.titulo}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-gray-400">{x.grupo}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs tabular-nums text-gray-600">
                      {x.afectados.length}
                    </span>
                  </button>

                  {open && (
                    <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-3">
                      <p className="text-[12.5px] leading-relaxed text-gray-600">{x.detalle}</p>
                      <ul className="mt-2 space-y-0.5">
                        {x.afectados.map((a, i) => (
                          <li key={i} className="text-[12.5px] text-gray-700">· {a}</li>
                        ))}
                      </ul>
                      <p className="mt-2.5 rounded border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] text-gray-600">
                        <b className="text-gray-500">Qué hacer:</b> {x.sugerencia}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      <p className="text-xs text-gray-500">
        El auditor <b>no corrige nada</b>. Casi toda inconsistencia entre planes es una decisión pendiente de
        alguien —qué fuente vale, si un cero es un incumplimiento o un vacío, si un objetivo se mide o se retira—
        y resolverla en silencio sería tomar esa decisión por la OIQE.
      </p>
    </div>
  )
}

function Caja({ t, v, d, alerta }: { t: string; v: number; d: string; alerta?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${alerta ? 'border-red-300 bg-red-50/60' : 'border-gray-200 bg-white'}`}>
      <p className="text-xs text-gray-500">{t}</p>
      <p className={`text-2xl font-bold tabular-nums ${alerta ? 'text-red-800' : 'text-gray-900'}`}>{v}</p>
      <p className="text-[11px] text-gray-400">{d}</p>
    </div>
  )
}
