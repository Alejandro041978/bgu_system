'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react'

interface Caso { kind: 'IW' | 'REENTRY'; trigger_id: string; student_id: string; student_name: string; document_number: string | null; fecha: string | null; detalle: string }
interface Tuition { lista: number; ahorro: number; beca: number; bonus: number; total: number }
interface Bloque {
  enrollment_id: string; program_name: string
  cursos: { course_id: string; code: string | null; name: string; credits: number; estado_actual: string; accion: string }[]
  creditos_antes: number | null; creditos_despues: number | null
  tuition_antes: Tuition | null; tuition_despues: Tuition | null; tuition_pagado: number
  cuotas: { external_id: string | null; accion: string; amount: number; nuevo_amount?: number; due_date: string | null; pagado?: number }[]
}
interface Preview { caso: Caso; bloques: Bloque[]; sin_cambios: boolean }

const money = (n: number | null | undefined) => n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
const ACCION: Record<string, string> = {
  retirar: 'Se retira (no cursada)', reactivar: 'Se reactiva (Re-Entry)', nuevo_intento: 'Nuevo intento (Re-Entry)',
  eliminar: 'Eliminar cuota impaga', reducir: 'Reducir a lo pagado', crear: 'Crear cuota',
}

export function IwReentryManager() {
  const [casos, setCasos] = useState<Caso[] | null>(null)
  const [sel, setSel] = useState<Caso | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<'todos' | 'IW' | 'REENTRY'>('todos')
  const [q, setQ] = useState('')

  const cargar = useCallback(async () => {
    const d = await fetch('/api/academic/iw-reentry').then(r => r.json()).catch(() => ({ error: 'Error de red' }))
    if (d.error) { setError(d.error); return }
    setCasos(d.casos)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function abrir(c: Caso) {
    setSel(c); setPreview(null); setError(null); setLoading(true)
    const d = await fetch(`/api/academic/iw-reentry?kind=${c.kind}&trigger_id=${c.trigger_id}`).then(r => r.json()).catch(() => ({ error: 'Error de red' }))
    setLoading(false)
    if (d.error) { setError(d.error); return }
    setPreview(d.preview)
  }

  async function accionar(action: 'aplicar' | 'descartar') {
    if (!sel) return
    let nota: string | undefined
    if (action === 'descartar') {
      const n = prompt('Motivo del descarte (obligatorio):')
      if (!n?.trim()) return
      nota = n.trim()
    } else if (!confirm(preview?.sin_cambios
      ? `Sin cambios necesarios para ${sel.student_name}. ¿Sellar el caso como revisado?`
      : `¿Autorizar y aplicar la gestión de ${sel.kind === 'IW' ? 'IW' : 'Re-Entry'} de ${sel.student_name}?\n\nSe ejecutará exactamente lo mostrado en la vista previa.`)) return
    setApplying(true); setError(null)
    const d = await fetch('/api/academic/iw-reentry', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: sel.kind, trigger_id: sel.trigger_id, action, nota }),
    }).then(r => r.json()).catch(() => ({ error: 'Error de red' }))
    setApplying(false)
    if (d.error) { setError(d.error); return }
    setSel(null); setPreview(null)
    cargar()
  }

  const visibles = (casos ?? []).filter(c =>
    (filtro === 'todos' || c.kind === filtro) &&
    (!q.trim() || `${c.student_name} ${c.document_number ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())))

  if (error && !casos) return <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>
  if (!casos) return <div className="py-20 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* Cola */}
      <div className="lg:col-span-2 space-y-3">
        <div className="flex gap-2">
          {(['todos', 'IW', 'REENTRY'] as const).map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${filtro === f ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200'}`}>
              {f === 'todos' ? `Todos (${casos.length})` : `${f === 'REENTRY' ? 'Re-Entry' : 'IW'} (${casos.filter(c => c.kind === f).length})`}
            </button>
          ))}
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar estudiante o documento…"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100" />
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-50 max-h-[70vh] overflow-auto">
          {visibles.map(c => (
            <button key={`${c.kind}:${c.trigger_id}`} onClick={() => abrir(c)}
              className={`w-full text-left px-4 py-2.5 hover:bg-gray-50 ${sel?.trigger_id === c.trigger_id ? 'bg-blue-50/60' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-gray-800 truncate">{c.student_name}</p>
                <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${c.kind === 'IW' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                  {c.kind === 'IW' ? 'IW' : 'Re-Entry'}
                </span>
              </div>
              <p className="text-[11px] text-gray-400">{c.detalle} · {c.fecha ?? 's/fecha'}</p>
            </button>
          ))}
          {!visibles.length && <p className="px-4 py-10 text-center text-xs text-gray-400">Sin casos pendientes.</p>}
        </div>
      </div>

      {/* Vista previa */}
      <div className="lg:col-span-3">
        {!sel && <div className="bg-white border border-gray-200 rounded-xl py-24 text-center text-sm text-gray-400">Elige un caso para ver su gestión.</div>}
        {sel && loading && <div className="py-24 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>}
        {sel && preview && (
          <div className="space-y-4">
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-gray-900">{sel.student_name} <span className="text-gray-400 font-normal">· {sel.document_number}</span></p>
              <p className="text-xs text-gray-500 mt-0.5">{sel.kind === 'IW' ? 'Retiro institucional' : 'Reincorporación (Re-Entry pagado)'} · {sel.detalle} · {sel.fecha}</p>
            </div>

            {preview.sin_cambios && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Sin cambios necesarios: el registro curricular y el plan de pagos ya están consistentes con este {sel.kind === 'IW' ? 'retiro' : 're-entry'}. Sellar deja constancia de la revisión.</span>
              </div>
            )}

            {preview.bloques.map(b => (
              <div key={b.enrollment_id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-800">{b.program_name}</p>
                </div>
                {b.cursos.length > 0 && (
                  <div className="px-4 py-3 border-b border-gray-50">
                    <p className="text-[11px] font-semibold text-gray-500 uppercase mb-1.5">Registro curricular</p>
                    <ul className="space-y-1">
                      {b.cursos.map(c => (
                        <li key={c.course_id + c.accion} className="text-xs flex items-baseline justify-between gap-2">
                          <span className="text-gray-700">{c.code ?? '—'} {c.name} <span className="text-gray-400">({c.credits} cr · {c.estado_actual})</span></span>
                          <span className={`shrink-0 font-medium ${c.accion === 'retirar' ? 'text-rose-600' : 'text-emerald-700'}`}>{ACCION[c.accion]}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="px-4 py-3 border-b border-gray-50 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-[11px] font-semibold text-gray-500 uppercase mb-1">Tuition actual</p>
                    <p className="text-gray-600">{b.creditos_antes ?? '—'} cr · lista {money(b.tuition_antes?.lista)} − TC {money(b.tuition_antes?.ahorro)} − beca {money(b.tuition_antes?.beca)} − bono {money(b.tuition_antes?.bonus)}</p>
                    <p className="font-semibold text-gray-900 mt-0.5">Total {money(b.tuition_antes?.total)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-gray-500 uppercase mb-1">Tuition tras la gestión</p>
                    <p className="text-gray-600">{b.creditos_despues ?? '—'} cr · lista {money(b.tuition_despues?.lista)} − TC {money(b.tuition_despues?.ahorro)} − beca {money(b.tuition_despues?.beca)} − bono {money(b.tuition_despues?.bonus)}</p>
                    <p className="font-semibold text-gray-900 mt-0.5">Total {money(b.tuition_despues?.total)} <span className="text-gray-400 font-normal">· pagado {money(b.tuition_pagado)}</span></p>
                  </div>
                </div>
                {b.cuotas.length > 0 && (
                  <div className="px-4 py-3">
                    <p className="text-[11px] font-semibold text-gray-500 uppercase mb-1.5">Plan de pagos</p>
                    <ul className="space-y-1">
                      {b.cuotas.map((qc, i) => (
                        <li key={i} className="text-xs flex items-baseline justify-between gap-2">
                          <span className="text-gray-700">
                            {qc.accion === 'crear'
                              ? <>Nueva cuota Tuition · vence {qc.due_date ?? 'hoy'}</>
                              : <>Cuota de {money(qc.amount)} · vence {qc.due_date ?? '—'}{qc.accion === 'reducir' ? ` · pagado ${money(qc.pagado)}` : ''}</>}
                          </span>
                          <span className={`shrink-0 font-medium ${qc.accion === 'eliminar' ? 'text-rose-600' : qc.accion === 'crear' ? 'text-blue-700' : 'text-amber-700'}`}>
                            {ACCION[qc.accion]}{qc.accion === 'crear' ? ` ${money(qc.amount)}` : qc.accion === 'reducir' ? ` → ${money(qc.nuevo_amount)}` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}

            <div className="flex items-center gap-3">
              <button onClick={() => accionar('aplicar')} disabled={applying}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                {preview.sin_cambios ? 'Sellar como revisado' : 'Autorizar y aplicar'}
              </button>
              <button onClick={() => accionar('descartar')} disabled={applying}
                className="px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                Descartar (con motivo)
              </button>
            </div>
            <p className="flex items-start gap-1.5 text-[11px] text-gray-400">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              Nada se aplica sin este paso. Al autorizar se ejecuta exactamente lo mostrado, con respaldo previo
              verificado; la foto completa queda en la gestión como auditoría y deshacer.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
