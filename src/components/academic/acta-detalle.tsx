'use client'

import { useState } from 'react'
import { Search, Loader2, ChevronRight, ChevronDown, Pencil } from 'lucide-react'

interface Slot { n: number; desc: string; pct: number | null; val: number | null }
interface Detail {
  id: string; external_id: string; editable: boolean; program_name: string
  course_code: string | null; course_name: string | null
  term_year: number | null; term_block: string | null
  final_grade: number | null; retake_grade: number | null; makeup_grade: number | null
  extra_points: number | null; passing_score: number | null; max_score: number | null
  grades: Slot[] | null; process_grades: Slot[] | null
  origen?: string | null; rendido_pct?: number | null; estado_academico?: string | null
}
interface StudentHit { id: string; name: string; document_number: string | null; email: string | null }

const g = (v: number | null) => (v == null ? '—' : Number(v).toFixed(2))

// Promedio ponderado de un conjunto de notas (Σ val×peso / Σ peso, solo slots con valor)
function weightedAvg(slots: Slot[] | null): number | null {
  if (!slots) return null
  let sumWV = 0, sumW = 0
  for (const s of slots) {
    if (s.val != null && s.pct != null) { sumWV += Number(s.val) * Number(s.pct); sumW += Number(s.pct) }
  }
  return sumW > 0 ? sumWV / sumW : null
}
// Calculado por nosotros: usa las notas principales; si no tienen valor, las de proceso
function calcAverage(d: Detail): number | null {
  return weightedAvg(d.grades) ?? weightedAvg(d.process_grades)
}

function statusOf(d: Detail): { label: string; cls: string } | null {
  // La etiqueta sale del estado calculado, NO de comparar la nota contra el
  // mínimo. La nota de Moodle es un acumulado sobre el 100% del curso: quien
  // rindió dos quizzes de 3,33% con 95 puntos tiene 6,33, y no está
  // desaprobado — está empezando.
  const est = (d as { estado_academico?: string | null }).estado_academico
  if (est === 'aprobado') return { label: 'Aprobado', cls: 'bg-green-50 text-green-700' }
  if (est === 'reprobado') return { label: 'Desaprobado', cls: 'bg-red-50 text-red-700' }
  if (est === 'pendiente') {
    const r = (d as { rendido_pct?: number | null }).rendido_pct
    return { label: r != null && r > 0 ? `En curso · ${Math.round(r)}%` : 'En curso', cls: 'bg-gray-100 text-gray-500' }
  }
  // Sin estado calculado (nota antigua sin recalcular): se cae al criterio viejo.
  const val = d.retake_grade ?? d.final_grade
  if (val == null) return { label: 'En curso', cls: 'bg-gray-100 text-gray-500' }
  if (d.passing_score == null) return null
  return val >= d.passing_score
    ? { label: 'Aprobado', cls: 'bg-green-50 text-green-700' }
    : { label: 'Desaprobado', cls: 'bg-red-50 text-red-700' }
}

export function ActaDetalle() {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<StudentHit[]>([])
  const [student, setStudent] = useState<StudentHit | null>(null)
  const [details, setDetails] = useState<Detail[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState<Set<string>>(new Set())

  async function search(value: string) {
    setQ(value); setStudent(null); setDetails([])
    if (value.trim().length < 2) { setHits([]); return }
    const d = await fetch(`/api/students/search?q=${encodeURIComponent(value.trim())}`).then(r => r.json())
    setHits(d.students ?? [])
  }

  async function selectStudent(h: StudentHit) {
    setStudent(h); setHits([]); setQ(h.name); setLoading(true); setOpen(new Set())
    const d = await fetch(`/api/academic/grade-details?student_id=${h.id}`).then(r => r.json())
    setDetails(d.details ?? []); setLoading(false)
  }

  async function reload() {
    if (!student) return
    const d = await fetch(`/api/academic/grade-details?student_id=${student.id}`).then(r => r.json())
    setDetails(d.details ?? [])
  }

  // Editar/borrar la nota FINAL de una asignatura de SystemActiva (vacío = borrar).
  async function editGrade(d: Detail) {
    const cur = d.retake_grade ?? d.final_grade
    const v = prompt(
      `Nota final de "${d.course_name ?? ''}" (importada de SystemActiva).\n\nEscribe la nueva nota final, o déjalo VACÍO para borrar TODAS las notas del curso (final + parciales) y poder retirarlo en Registro Curricular:`,
      cur != null ? String(cur) : '')
    if (v === null) return
    const final_grade = v.trim() === '' ? null : Number(v.trim())
    if (final_grade !== null && !(final_grade >= 0)) { alert('Nota inválida'); return }
    const res = await fetch('/api/academic/course-withdrawal', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ external_id: d.external_id, final_grade }),
    }).then(r => r.json())
    if (res.error) { alert(res.error); return }
    reload()
  }

  function toggle(id: string) {
    setOpen(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  // Agrupar por PROGRAMA y nada más.
  //
  // Antes se agrupaba por "term_year · term_block", y esos dos campos son dos
  // herencias distintas pegadas: term_block trae unas veces el bloque de Activa
  // ('1', '2') y otras el código de semestre de Moodle
  // ('AY_25-26_SUMMER_2026'), mientras term_year viene por su cuenta. En 6.505
  // notas el año del campo CONTRADICE al año del nombre del bloque, y solo en
  // 2.235 coinciden; otras 12.611 no tienen bloque legible. De ahí salían
  // encabezados como "2025 · AY_25-26_SUMMER_2026", que es un año de un sistema
  // junto al nombre de otro.
  //
  // Un período inventado a partir de datos que se contradicen es peor que no
  // mostrar período: el acta es un documento académico y ahí una fecha falsa
  // pesa. Se ordena por asignatura, como el acta personal.
  const byProgram = new Map<string, Detail[]>()
  for (const d of details) {
    if (!byProgram.has(d.program_name)) byProgram.set(d.program_name, [])
    byProgram.get(d.program_name)!.push(d)
  }
  for (const lista of byProgram.values()) {
    lista.sort((a, b) => String(a.course_code ?? '').localeCompare(String(b.course_code ?? ''))
      || String(a.course_name ?? '').localeCompare(String(b.course_name ?? '')))
  }

  return (
    <div className="space-y-4">
      {/* Buscador */}
      <div className="relative">
        <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 shadow-sm">
          <Search className="w-4 h-4 text-gray-400" />
          <input value={q} onChange={e => search(e.target.value)} placeholder="Buscar estudiante por nombre o documento…"
            className="flex-1 px-3 py-3 text-sm focus:outline-none" />
        </div>
        {hits.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-auto">
            {hits.map(h => (
              <button key={h.id} onClick={() => selectStudent(h)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                <p className="text-sm text-gray-800">{h.name}</p>
                <p className="text-xs text-gray-400">{h.document_number ?? h.email}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>}

      {!loading && student && details.length === 0 && (
        <p className="text-sm text-gray-400 py-10 text-center">Sin detalle de calificaciones para este estudiante.</p>
      )}

      {!loading && [...byProgram.entries()].map(([prog, courses]) => (
        <div key={prog} className="space-y-3">
          <h2 className="text-base font-semibold text-gray-900">{prog}</h2>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="divide-y divide-gray-50">
              {courses.map(d => {
                  const st = statusOf(d)
                  const val = d.retake_grade ?? d.final_grade
                  const isOpen = open.has(d.id)
                  return (
                    <div key={d.id}>
                      <button onClick={() => toggle(d.id)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left">
                        {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 truncate">{d.course_name ?? d.course_code ?? '—'}</p>
                          {d.course_code && <p className="text-xs text-gray-400">{d.course_code}</p>}
                        </div>
                        <span className="text-sm font-semibold text-gray-900 w-12 text-right">{g(val)}</span>
                        {st && <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${st.cls}`}>{st.label}</span>}
                      </button>
                      {isOpen && <DetailPanel d={d} onEdit={() => editGrade(d)} />}
                    </div>
                  )
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function SlotTable({ title, slots }: { title: string; slots: Slot[] }) {
  if (!slots || slots.length === 0) return null
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 mb-1">{title}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] text-gray-400 uppercase tracking-wide">
            <th className="text-left px-2 py-1">Descripción</th>
            <th className="text-right px-2 py-1 w-16">Peso</th>
            <th className="text-right px-2 py-1 w-16">Nota</th>
          </tr>
        </thead>
        <tbody>
          {slots.map(s => (
            <tr key={s.n} className="border-t border-gray-50">
              <td className="px-2 py-1 text-gray-700">{s.desc}</td>
              <td className="px-2 py-1 text-right text-gray-400">{s.pct != null ? `${s.pct}%` : '—'}</td>
              <td className="px-2 py-1 text-right font-medium text-gray-800">{g(s.val)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DetailPanel({ d, onEdit }: { d: Detail; onEdit: () => void }) {
  // Lista unificada: ya no se distingue entre notas principales y de proceso
  // (las integraciones nuevas escriben todo en una sola lista; la separación
  // era herencia de SystemActiva). Se oculta el marcador "Total" vacío que
  // dejaba SystemActiva como placeholder.
  const evaluaciones = [
    ...(d.grades ?? []).filter(s => !(s.val == null && (s.desc ?? '').trim().toLowerCase() === 'total')),
    ...(d.process_grades ?? []),
  ].map((s, i) => ({ ...s, n: i + 1 }))
  return (
    <div className="px-4 pb-4 pt-1 bg-gray-50/50 space-y-3">
      {d.editable && (
        <div className="flex justify-end">
          <button onClick={onEdit}
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
            title="Nota importada de SystemActiva: edítala o bórrala (vacío) para poder retirar la asignatura">
            <Pencil className="w-3.5 h-3.5" />Editar nota final
          </button>
        </div>
      )}
      <SlotTable title="Evaluaciones" slots={evaluaciones} />
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-600 pt-1">
        {/* El origen es un dato, no una etiqueta fija. Antes decía siempre
            "SystemActiva", así que una nota recién traída del campus seguía
            atribuyéndose a un sistema apagado hace meses. */}
        <span>Final <span className="text-gray-400">({d.origen === 'moodle' ? 'Moodle'
          : d.origen === 'systemactiva' ? 'SystemActiva'
          : d.origen === 'csv' ? 'carga CSV' : 'registro'})</span>: <b>{g(d.final_grade)}</b></span>
        {(() => {
          const calc = calcAverage(d)
          if (calc == null) return null
          // En Moodle el total es un ACUMULADO sobre el 100% del curso, no el
          // promedio de lo rendido: mientras falte por calificar, el total
          // estará por debajo y eso no es una discrepancia sino aritmética.
          // Marcarlo "≠ difiere" hacía sospechar de un dato correcto.
          const enCurso = d.origen === 'moodle' && d.rendido_pct != null && Number(d.rendido_pct) < 99.5
          const match = d.final_grade != null ? Math.abs(calc - Number(d.final_grade)) < 0.5 : null
          return (
            <span>Promedio <span className="text-gray-400">(de lo rendido)</span>: <b>{g(calc)}</b>
              {enCurso
                ? <span className="ml-1 text-gray-400">— el total acumula sobre el 100% del curso</span>
                : match === true ? <span className="ml-1 text-green-600">✓ coincide</span>
                : match === false ? <span className="ml-1 text-amber-600">≠ difiere</span> : null}
            </span>
          )
        })()}
        {d.retake_grade != null && <span>Recuperación: <b>{g(d.retake_grade)}</b></span>}
        {d.makeup_grade != null && <span>Subsanación: <b>{g(d.makeup_grade)}</b></span>}
        {d.extra_points != null && d.extra_points !== 0 && <span>Puntos extra: <b>{g(d.extra_points)}</b></span>}
        {d.passing_score != null && <span>Nota aprobatoria: <b>{g(d.passing_score)}</b></span>}
        {d.max_score != null && <span>Máx: <b>{g(d.max_score)}</b></span>}
      </div>
    </div>
  )
}
