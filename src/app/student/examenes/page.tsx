'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, FileCheck, CheckCircle2, Clock, Wallet } from 'lucide-react'

interface ExamType { id: string; name: string; price: number }
interface Eligible {
  grade_external_id: string; course_code: string | null; course_name: string | null
  final: number; passing: number; pct_rendida: number
}
interface Request {
  id: string; course_code: string | null; course_name: string | null
  status: string; requested_at: string; paid_at: string | null; result_grade: number | null
  exam_types: { name: string; price: number } | null
}
interface Data { types: ExamType[]; eligible: Eligible[]; requests: Request[] }

const STATUS: Record<string, { label: string; cls: string }> = {
  pendiente_pago: { label: 'Pendiente de pago', cls: 'bg-amber-50 text-amber-700' },
  pendiente_evaluacion: { label: 'Pagado · pendiente de evaluación', cls: 'bg-blue-50 text-blue-700' },
  evaluado: { label: 'Evaluado', cls: 'bg-green-50 text-green-700' },
  anulado: { label: 'Anulado', cls: 'bg-gray-100 text-gray-500' },
}
const fdate = (d: string | null) => (d ? d.split('T')[0].split('-').reverse().join('/') : '—')

export default function StudentExamsPage() {
  const [data, setData] = useState<Data | null>(null)
  const [typeId, setTypeId] = useState('')
  const [gradeId, setGradeId] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const load = useCallback(() => {
    fetch('/api/student/exams').then(r => r.json()).then(d => {
      if (!d.error) {
        setData(d)
        if ((d.types ?? []).length === 1) setTypeId(d.types[0].id)
      }
    })
  }, [])
  useEffect(() => { load() }, [load])

  async function solicitar() {
    if (!typeId || !gradeId) return
    setSaving(true); setNotice(null)
    const d = await fetch('/api/student/exams', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exam_type_id: typeId, grade_external_id: gradeId }),
    }).then(r => r.json())
    setSaving(false)
    if (d.error) { setNotice({ kind: 'error', text: d.error }); return }
    setNotice({ kind: 'ok', text: `Solicitud registrada. Se cargaron $${Number(d.charge).toFixed(2)} a tu Estado de Cuenta: al pagarlos, tu examen pasa a programación.` })
    setGradeId('')
    load()
  }

  if (!data) return <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>
  const tipo = data.types.find(t => t.id === typeId)

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Exámenes</h1>
        <p className="text-sm text-gray-500 mt-0.5">Solicita un examen cuando cumplas los requisitos: el costo se carga a tu Estado de Cuenta.</p>
      </div>

      {notice && (
        <p className={`text-sm px-4 py-3 rounded-xl ${notice.kind === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-600'}`}>{notice.text}</p>
      )}

      {/* Solicitar */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <label className="block max-w-sm">
          <span className="block text-xs text-gray-500 mb-1">Tipo de examen</span>
          <select value={typeId} onChange={e => { setTypeId(e.target.value); setGradeId('') }}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Seleccionar…</option>
            {data.types.map(t => <option key={t.id} value={t.id}>{t.name} — ${Number(t.price).toFixed(2)}</option>)}
          </select>
        </label>

        {typeId && (
          data.eligible.length === 0 ? (
            <p className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg px-4 py-6 text-center">
              No tienes asignaturas que cumplan los requisitos por ahora.<br />
              <span className="text-xs">Subsanación: asignatura desaprobada con al menos el 70% de las evaluaciones rendidas.</span>
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-600">Asignaturas que cumplen el requisito</p>
              <p className="text-[11px] text-gray-400 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                Requisitos: la asignatura debe estar <span className="font-medium text-gray-500">desaprobada</span> (promedio
                por debajo del mínimo de tu programa) y debes haber <span className="font-medium text-gray-500">rendido al
                menos el 70%</span> de las evaluaciones que componen la nota. Solo aparecen aquí las asignaturas que ya
                cumplen ambas condiciones.
              </p>
              {data.eligible.map(e => (
                <label key={e.grade_external_id}
                  className={`flex items-center gap-3 border rounded-lg px-3 py-2.5 cursor-pointer ${gradeId === e.grade_external_id ? 'border-blue-400 bg-blue-50/40' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" name="curso" checked={gradeId === e.grade_external_id}
                    onChange={() => setGradeId(e.grade_external_id)} className="text-blue-600" />
                  <span className="flex-1">
                    <span className="block text-sm text-gray-800">{e.course_name ?? e.course_code}</span>
                    <span className="block text-[11px] text-gray-400">
                      {e.course_code} · promedio {e.final} (mínimo {e.passing}) · {e.pct_rendida}% de evaluaciones rendidas
                    </span>
                  </span>
                </label>
              ))}
              <button onClick={solicitar} disabled={!gradeId || saving}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium px-4 py-2.5 rounded-lg">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck className="w-4 h-4" />}
                Solicitar {tipo ? `(se cargarán $${Number(tipo.price).toFixed(2)})` : ''}
              </button>
            </div>
          )
        )}
      </div>

      {/* Mis solicitudes */}
      {data.requests.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <p className="px-4 py-2.5 border-b border-gray-100 text-sm font-semibold text-gray-800">Mis solicitudes</p>
          <div className="divide-y divide-gray-50">
            {data.requests.map(r => (
              <div key={r.id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                <span className="text-sm text-gray-800 flex-1 min-w-[200px]">
                  {r.exam_types?.name ?? 'Examen'} · {r.course_name ?? r.course_code}
                </span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS[r.status]?.cls ?? 'bg-gray-100 text-gray-500'}`}>
                  {STATUS[r.status]?.label ?? r.status}
                </span>
                {r.status === 'pendiente_pago' && (
                  <a href="/student/account" className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:underline">
                    <Wallet className="w-3 h-3" /> Pagar en Estado de Cuenta
                  </a>
                )}
                {r.status === 'pendiente_evaluacion' && <Clock className="w-3.5 h-3.5 text-blue-400" />}
                {r.status === 'evaluado' && r.result_grade != null && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700">
                    <CheckCircle2 className="w-3 h-3" /> Nota: {r.result_grade}
                  </span>
                )}
                <span className="text-[11px] text-gray-400">{fdate(r.requested_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
