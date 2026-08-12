'use client'

import { useState } from 'react'
import { Search, User, Loader2, FileText, LogOut, Pencil } from 'lucide-react'
import { usePermissions } from '@/hooks/use-permissions'

interface StudentHit { id: string; name: string; document_number: string | null; email: string | null }
interface Program { id: string; name: string }
interface Row { external_id: string; course_code: string | null; course_name: string; credits: number | null; term: string; status: string; grade: number | null; has_grade: boolean; withdrawn: boolean; editable: boolean; final_grade: number | null; retake_grade: number | null; kind: 'inscripcion' | 'convalidacion' | 'sin_registrar' }
interface Data { program: string; enrollment: { id: string; list_price: number | null; credit_rate: number | null } | null; creditos_activos: number; creditos_que_lleva: number | null; malla_total: number; sin_registrar: number; rows: Row[] }

const money = (n: number) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const STATUS: Record<string, { label: string; cls: string }> = {
  aprobado: { label: 'Aprobado', cls: 'bg-green-50 text-green-700' },
  desaprobado: { label: 'Desaprobado', cls: 'bg-red-50 text-red-700' },
  en_proceso: { label: 'En proceso', cls: 'bg-amber-50 text-amber-700' },
  convalidado: { label: 'Convalidado', cls: 'bg-violet-50 text-violet-700' },
  no_iniciada: { label: 'No iniciada', cls: 'bg-gray-100 text-gray-500' },
  sin_registrar: { label: 'Sin registrar', cls: 'bg-orange-50 text-orange-700' },
}

export function CurricularRecord() {
  // "Editar nota" escribe una calificación: solo superadmin (ver api-guard).
  const { superadmin } = usePermissions()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<StudentHit[]>([])
  const [student, setStudent] = useState<StudentHit | null>(null)
  const [programs, setPrograms] = useState<Program[]>([])
  const [programId, setProgramId] = useState('')
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  async function search(value: string) {
    setQ(value); setStudent(null); setData(null); setPrograms([]); setProgramId(''); setNotice(null)
    if (value.trim().length < 2) { setHits([]); return }
    const d = await fetch(`/api/students/search?q=${encodeURIComponent(value.trim())}`).then(r => r.json())
    setHits(d.students ?? [])
  }

  async function load(sid: string, pid: string) {
    setLoading(true); setNotice(null)
    const d = await fetch(`/api/academic/course-withdrawal?student_id=${sid}&program_id=${pid}`).then(r => r.json())
    setData(d.error ? null : d); setLoading(false)
  }

  async function selectStudent(h: StudentHit) {
    setStudent(h); setHits([]); setQ(h.name); setData(null); setProgramId('')
    const d = await fetch(`/api/students/${h.id}/programs`).then(r => r.json()).catch(() => ({ programs: [] }))
    const progs: Program[] = d.programs ?? []
    setPrograms(progs)
    if (progs.length >= 1) { setProgramId(progs[0].id); load(h.id, progs[0].id) }
  }

  function pickProgram(pid: string) { setProgramId(pid); if (student && pid) load(student.id, pid) }

  async function withdraw(r: Row) {
    if (!student || !data) return
    const val = (data.enrollment?.credit_rate != null && r.credits) ? data.enrollment.credit_rate * r.credits : null
    const msg = `¿Retirar a ${student.name} de "${r.course_name}" (${r.credits ?? '—'} cr)?\n\n` +
      (val != null ? `Bajará el Total Tuition en ${money(val)} (${r.credits} cr × ${money(data.enrollment!.credit_rate!)}).\n` : 'Esta matrícula no tiene precio regulado, así que no cambia el Total Tuition.\n') +
      `El ajuste de las cuotas lo haces tú luego. Esta acción libera el crédito.`
    if (!confirm(msg)) return
    setBusy(r.external_id); setNotice(null)
    const d = await fetch('/api/academic/course-withdrawal', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ external_id: r.external_id, student_id: student.id, program_id: programId }),
    }).then(x => x.json())
    setBusy(null)
    if (d.error) { setNotice({ kind: 'error', text: d.error }); return }
    setNotice({ kind: 'ok', text: `Retirada "${r.course_name}"${d.delta ? ` · Total Tuition ↓ ${money(d.delta)} → nuevo precio ${money(d.new_list_price)}` : ''}. Recuerda ajustar las cuotas.` })
    load(student.id, programId)
  }

  async function editGrade(r: Row) {
    if (!student) return
    const cur = r.retake_grade ?? r.final_grade
    const v = prompt(
      `Nota de "${r.course_name}" (importada de SystemActiva).\n\nEscribe la nueva nota final, o déjalo VACÍO para borrar TODAS las notas del curso (final + parciales) y poder retirarlo:`,
      cur != null ? String(cur) : '')
    if (v === null) return
    const final_grade = v.trim() === '' ? null : Number(v.trim())
    if (final_grade !== null && !(final_grade >= 0)) { setNotice({ kind: 'error', text: 'Nota inválida' }); return }
    setBusy(r.external_id); setNotice(null)
    const d = await fetch('/api/academic/course-withdrawal', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ external_id: r.external_id, final_grade }),
    }).then(x => x.json())
    setBusy(null)
    if (d.error) { setNotice({ kind: 'error', text: d.error }); return }
    setNotice({ kind: 'ok', text: d.cleared ? `Nota de "${r.course_name}" borrada. Ya puedes retirarla.` : `Nota de "${r.course_name}" actualizada a ${d.final_grade}.` })
    load(student.id, programId)
  }

  const activos = data?.rows.filter(r => !r.withdrawn) ?? []
  const retirados = data?.rows.filter(r => r.withdrawn) ?? []

  return (
    <div className="space-y-4">
      <div className="relative">
        <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 shadow-sm">
          <Search className="w-4 h-4 text-gray-400" />
          <input value={q} onChange={e => search(e.target.value)} placeholder="Buscar estudiante por nombre o documento…"
            className="flex-1 px-3 py-3 text-sm focus:outline-none" />
        </div>
        {hits.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-auto">
            {hits.map(h => (
              <button key={h.id} onClick={() => selectStudent(h)} className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                <p className="text-sm text-gray-800">{h.name}</p>
                <p className="text-xs text-gray-400">{h.document_number ?? h.email}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {student && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-blue-500" />
            <div>
              <p className="text-sm font-semibold text-gray-900">{student.name}</p>
              <p className="text-xs text-gray-400">Documento: {student.document_number ?? '—'}</p>
            </div>
          </div>
          {programs.length > 1 && (
            <select value={programId} onChange={e => pickProgram(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
              {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          {programs.length === 1 && <span className="text-sm text-gray-600">{programs[0].name}</span>}
        </div>
      )}

      {notice && (
        <p className={`text-sm px-3 py-2 rounded-lg ${notice.kind === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{notice.text}</p>
      )}

      {loading && <div className="bg-white rounded-xl border border-gray-200 py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>}

      {data && !loading && (
        <>
          {/* Resumen */}
          <div className="flex flex-wrap gap-3">
            <Stat label="Créditos activos" value={String(data.creditos_activos)} />
            {/* El precio sale de TODO lo que lleva (convalidadas incluidas), no
                solo de lo que se ve en esta tabla: si no se dice, el Total
                Tuition parece no cuadrar con la tarifa por crédito. */}
            {data.creditos_que_lleva != null && <Stat label="Créditos que lleva (con convalidadas)" value={String(data.creditos_que_lleva)} />}
            {data.enrollment?.credit_rate != null && <Stat label="Tarifa por crédito" value={money(data.enrollment.credit_rate)} />}
            <Stat label="Total Tuition (precio oficial)" value={data.enrollment?.list_price != null ? money(data.enrollment.list_price) : '—'} accent />
          </div>

          {/* Un matriculado debería tener su malla entera en el registro; solo
              un IW justifica que falten. Se avisa aquí y no en un informe
              aparte porque quien lo puede arreglar está en esta pantalla. */}
          {data.sin_registrar > 0 && (
            <p className="text-sm px-3 py-2 rounded-lg bg-amber-50 text-amber-800">
              Su registro tiene {data.malla_total - data.sin_registrar} de {data.malla_total} asignaturas de la malla:
              faltan {data.sin_registrar} por inscribir.
            </p>
          )}

          {/* Inscripciones activas */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-5 py-2.5">Asignatura</th>
                  <th className="text-center px-3 py-2.5 w-16">Cr.</th>
                  <th className="text-left px-3 py-2.5 w-40">Término</th>
                  <th className="text-center px-3 py-2.5 w-20">Nota</th>
                  <th className="text-left px-3 py-2.5 w-32">Estado</th>
                  <th className="px-3 py-2.5 w-28"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {activos.map(r => {
                  const st = STATUS[r.status] ?? STATUS.en_proceso
                  return (
                    <tr key={r.external_id} className={`hover:bg-gray-50/50 ${r.kind === 'sin_registrar' ? 'bg-gray-50/40' : ''}`}>
                      <td className="px-5 py-2.5">
                        <p className="font-medium text-gray-800">{r.course_name}</p>
                        {r.course_code && <p className="text-xs text-gray-400">{r.course_code}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-center text-gray-500">{r.credits ?? '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">{r.term || '—'}</td>
                      <td className="px-3 py-2.5 text-center">{r.grade != null ? <span className={`font-semibold ${r.status === 'desaprobado' ? 'text-red-600' : 'text-gray-800'}`}>{r.grade}</span> : <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2.5"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span></td>
                      <td className="px-3 py-2.5 text-right">
                        {/* Convalidadas y no registradas se ven, pero no se
                            retiran: no son inscripciones de este programa. */}
                        {r.kind !== 'inscripcion' ? null : busy === r.external_id ? <Loader2 className="w-3.5 h-3.5 animate-spin inline text-gray-400" /> : r.has_grade ? (
                          r.editable && superadmin ? (
                            <button onClick={() => editGrade(r)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                              title="Nota de SystemActiva: edítala o bórrala para poder retirar">
                              <Pencil className="w-3.5 h-3.5" />Editar nota
                            </button>
                          ) : (
                            <span className="text-[11px] text-gray-300" title="Nota sincronizada de Moodle: no editable aquí">no retirable</span>
                          )
                        ) : (
                          <button onClick={() => withdraw(r)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-800">
                            <LogOut className="w-3.5 h-3.5" />Retirar
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {activos.length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-10 text-sm">Sin inscripciones activas en este programa.</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Retiradas */}
          {retirados.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <p className="px-5 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-100">Retiradas ({retirados.length})</p>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-50">
                  {retirados.map(r => (
                    <tr key={r.external_id} className="opacity-60">
                      <td className="px-5 py-2 text-gray-600 line-through">{r.course_name}</td>
                      <td className="px-3 py-2 text-center text-gray-400 w-16">{r.credits ?? '—'}</td>
                      <td className="px-3 py-2 text-xs text-gray-400">{r.term || '—'}</td>
                      <td className="px-3 py-2"><span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Retirada</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {!student && (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 py-20 text-center text-gray-400">
          <FileText className="w-10 h-10 mx-auto mb-3" />
          <p className="text-sm">Busca un estudiante para gestionar su registro curricular</p>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${accent ? 'text-blue-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}
