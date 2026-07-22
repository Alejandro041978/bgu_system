'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Bell, CheckCircle2, CircleSlash, Award } from 'lucide-react'

interface Row {
  id: string; student_name: string; document: string; student_email: string | null
  course_code: string | null; course_name: string | null
  status: string; requested_at: string; paid_at: string | null
  notified_at: string | null; result_grade: number | null; evaluated_by: string | null; evaluated_at: string | null
  exam_types: { name: string; price: number } | null
}

const STATUS: Record<string, { label: string; cls: string }> = {
  pendiente_pago: { label: 'Pendiente de pago', cls: 'bg-amber-50 text-amber-700' },
  pendiente_evaluacion: { label: 'Pendiente de evaluación', cls: 'bg-blue-50 text-blue-700' },
  evaluado: { label: 'Evaluado', cls: 'bg-green-50 text-green-700' },
  anulado: { label: 'Anulado', cls: 'bg-gray-100 text-gray-500' },
}
const fdate = (d: string | null) => (d ? d.split('T')[0].split('-').reverse().join('/') : '—')

export function ExamsControl() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [filter, setFilter] = useState('pendiente_evaluacion')
  const [busy, setBusy] = useState<string | null>(null)
  const [grade, setGrade] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const load = useCallback(() => {
    fetch(`/api/academic/exams${filter ? `?status=${filter}` : ''}`)
      .then(r => r.json()).then(d => {
        if (d.error) setNotice({ kind: 'error', text: d.error })
        else { setRows(d.rows ?? []); setCounts(d.counts ?? {}) }
      })
  }, [filter])
  useEffect(() => { load() }, [load])

  async function act(id: string, body: object, okText: string, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return
    setBusy(id); setNotice(null)
    const d = await fetch('/api/academic/exams', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...body }),
    }).then(r => r.json())
    setBusy(null)
    if (d.error) { setNotice({ kind: 'error', text: d.error }); return }
    setNotice({ kind: 'ok', text: okText })
    load()
  }

  if (rows === null) return <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>

  return (
    <div className="space-y-4">
      {notice && (
        <p className={`text-sm px-3 py-2 rounded-lg ${notice.kind === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{notice.text}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {[['', 'Todas'], ['pendiente_pago', 'Pendientes de pago'], ['pendiente_evaluacion', 'Pendientes de evaluación'], ['evaluado', 'Evaluadas'], ['anulado', 'Anuladas']].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${filter === k ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {l}{k && counts[k] ? ` (${counts[k]})` : ''}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
              <th className="text-left px-4 py-3">Estudiante</th>
              <th className="text-left px-3 py-3">Examen · Asignatura</th>
              <th className="text-left px-3 py-3">Estado</th>
              <th className="text-left px-3 py-3">Pagado</th>
              <th className="text-left px-3 py-3">Notificado</th>
              <th className="text-left px-3 py-3">Nota</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">Sin solicitudes en este filtro.</td></tr>
            )}
            {rows.map(r => (
              <tr key={r.id} className="hover:bg-gray-50/50 align-top">
                <td className="px-4 py-2.5">
                  <span className="text-gray-800">{r.student_name}</span>
                  <span className="block text-[11px] text-gray-400">{r.document}{r.student_email ? ` · ${r.student_email}` : ''}</span>
                </td>
                <td className="px-3 py-2.5">
                  <span className="text-gray-700">{r.exam_types?.name ?? 'Examen'}</span>
                  <span className="block text-[11px] text-gray-400">{r.course_name ?? r.course_code}</span>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS[r.status]?.cls ?? 'bg-gray-100 text-gray-500'}`}>{STATUS[r.status]?.label ?? r.status}</span>
                </td>
                <td className="px-3 py-2.5 text-xs text-gray-500">{fdate(r.paid_at)}</td>
                <td className="px-3 py-2.5 text-xs text-gray-500">
                  {r.notified_at ? fdate(r.notified_at) : r.status === 'pendiente_evaluacion' ? (
                    <button onClick={() => act(r.id, { action: 'notificado' }, 'Marcado como notificado')}
                      disabled={busy === r.id}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800">
                      <Bell className="w-3 h-3" /> Marcar notificado
                    </button>
                  ) : '—'}
                </td>
                <td className="px-3 py-2.5">
                  {r.status === 'evaluado' ? (
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-green-700">
                      <Award className="w-3.5 h-3.5" /> {r.result_grade}
                    </span>
                  ) : r.status === 'pendiente_evaluacion' ? (
                    <span className="inline-flex items-center gap-1.5">
                      <input type="number" min={0} max={100} step="0.01" value={grade[r.id] ?? ''}
                        onChange={e => setGrade(p => ({ ...p, [r.id]: e.target.value }))}
                        placeholder="0-100"
                        className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <button
                        onClick={() => act(r.id, { action: 'nota', grade: Number(grade[r.id]) },
                          'Nota registrada: viajó al acta como recuperación',
                          `¿Registrar ${grade[r.id]} como nota del examen de ${r.student_name}? Irá al acta como recuperación (la mejor nota gana).`)}
                        disabled={busy === r.id || grade[r.id] === undefined || grade[r.id] === ''}
                        className="inline-flex items-center gap-1 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-[11px] px-2 py-1 rounded-lg">
                        {busy === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Registrar
                      </button>
                    </span>
                  ) : '—'}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {['pendiente_pago', 'pendiente_evaluacion'].includes(r.status) && (
                    <button onClick={() => act(r.id, { action: 'anular' }, 'Solicitud anulada', `¿Anular la solicitud de ${r.student_name}? Si el cargo sigue impago, se borra del estado de cuenta.`)}
                      disabled={busy === r.id}
                      className="inline-flex items-center gap-1 border border-gray-200 hover:border-gray-300 text-gray-500 text-[11px] px-2 py-1 rounded-lg">
                      <CircleSlash className="w-3 h-3" /> Anular
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-gray-400">
        Flujo: el estudiante solicita desde su portal (elegibilidad automática: desaprobada con ≥70% de ponderación rendida) → el cargo llega al estado de cuenta → al pagarse aparece aquí → notificas al estudiante con el link del examen → registras la nota → viaja al acta como recuperación (la mejor gana) y dispara carrusel/egreso.
      </p>
    </div>
  )
}
