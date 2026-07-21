'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Users, CheckCircle2, ArrowRightCircle } from 'lucide-react'

interface Ref { id: string; name: string }
interface Conv { id: string; name: string; semester: string; first_day: string | null }
interface ProgEntry {
  program_id: string; name: string
  enrollment_id?: string
  pending_payment?: boolean
  placed: { group_id: string; label: string; status: string } | null
  candidates: { id: string; label: string }[]
}
interface Row { student_id: string; name: string; document: string; situation: string | null; programs: ProgEntry[]; fecha: string | null }
interface Data {
  matriculas: number; estudiantes: number; sin_colocar: number
  por_programa: { programa: string; n: number; sin_colocar: number }[]
  rows: Row[]
}

const fdate = (d: string | null) => (d ? d.split('T')[0].split('-').reverse().join('/') : '—')

const SIT_STYLE: Record<string, string> = {
  activo: 'bg-green-50 text-green-700',
  egresado: 'bg-blue-50 text-blue-700',
  IW: 'bg-red-50 text-red-600',
  LOA: 'bg-amber-50 text-amber-700',
}

export function ConvocatoriaStudents() {
  const [categories, setCategories] = useState<Ref[]>([])
  const [years, setYears] = useState<Ref[]>([])
  const [convs, setConvs] = useState<Conv[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [yearId, setYearId] = useState('')
  const [convId, setConvId] = useState('')
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')
  // selección de carrusel por matrícula (clave student|program) y estado de colocación
  const [choice, setChoice] = useState<Record<string, string>>({})
  const [placing, setPlacing] = useState<Record<string, boolean>>({})
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/convocatorias').then(r => r.json()).then(d => {
      setCategories(d.categories ?? []); setYears(d.years ?? [])
      if ((d.years ?? []).length) setYearId(d.years[0].id)
    })
  }, [])

  // Convocatorias de la categoría en el año elegido (mismo endpoint de Gestión)
  useEffect(() => {
    setConvs([]); setConvId(''); setData(null)
    if (!categoryId || !yearId) return
    fetch(`/api/convocatorias?category_id=${categoryId}&year_id=${yearId}`)
      .then(r => r.json()).then(d => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const flat: Conv[] = (d.semesters ?? []).flatMap((s: any) =>
          (s.convocatorias ?? []).map((c: { id: string; name: string; first_day: string | null }) => ({
            id: c.id, name: c.name, semester: s.name, first_day: c.first_day,
          })))
        setConvs(flat)
      })
  }, [categoryId, yearId])

  const load = useCallback((cid: string) => {
    setLoading(true)
    fetch(`/api/academic/convocatoria-students?convocatoria_id=${cid}`)
      .then(r => r.json()).then(d => { if (!d.error) setData(d); setLoading(false) })
  }, [])

  useEffect(() => {
    setData(null); setFilter(''); setChoice({}); setNotice(null)
    if (!convId) return
    load(convId)
  }, [convId, load])

  async function place(row: Row, p: ProgEntry) {
    const key = `${row.student_id}|${p.program_id}`
    const groupId = p.candidates.length === 1 ? p.candidates[0].id : choice[key]
    if (!groupId) return
    setPlacing(prev => ({ ...prev, [key]: true }))
    setNotice(null)
    const res = await fetch('/api/academic/convocatoria-students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: row.student_id, program_id: p.program_id, group_id: groupId }),
    })
    const d = await res.json()
    setPlacing(prev => ({ ...prev, [key]: false }))
    if (!res.ok || d.error) {
      setNotice({ kind: 'error', text: `${row.name}: ${d.error ?? 'error al colocar'}` })
    } else {
      const moodleNote = d.moodle?.configured
        ? (d.moodle.errors?.length ? ` · Moodle con avisos: ${d.moodle.errors.join('; ')}` : ` · ${d.moodle.enrol_ops} matrículas en aulas Moodle`)
        : ' · Moodle no configurado'
      setNotice({ kind: 'ok', text: `${row.name} colocado en ${d.group_label}${moodleNote}` })
    }
    load(convId)
  }

  // Activación manual de una matrícula pendiente de pago (excepciones: becas,
  // convenios). El backend exige force y deja auditado quién lo pulsó.
  async function activate(row: Row, p: ProgEntry) {
    if (!p.enrollment_id) return
    if (!confirm(`¿Activar la matrícula de ${row.name} en ${p.name} sin esperar el pago? Quedará registrado a tu nombre.`)) return
    const key = `${row.student_id}|${p.program_id}`
    setPlacing(prev => ({ ...prev, [key]: true }))
    setNotice(null)
    const res = await fetch('/api/admision/matricula/activate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enrollment_id: p.enrollment_id, force: true }),
    })
    const d = await res.json()
    setPlacing(prev => ({ ...prev, [key]: false }))
    if (!res.ok && res.status !== 207) {
      setNotice({ kind: 'error', text: `${row.name}: ${d.error ?? 'error al activar'}` })
    } else {
      const partes = [
        d.acta_registradas ? `${d.acta_registradas} asignaturas registradas en el acta` : null,
        d.correo?.ok ? `correo ${d.correo.email}` : null,
        d.colocacion?.note ?? null,
      ].filter(Boolean).join(' · ')
      setNotice({ kind: d.errors?.length ? 'error' : 'ok', text: `${row.name} activado: ${partes}${d.errors?.length ? ` · avisos: ${d.errors.join('; ')}` : ''}` })
    }
    load(convId)
  }

  const visible = data?.rows.filter(r => {
    if (!filter) return true
    const q = filter.toLowerCase()
    return r.name.toLowerCase().includes(q) || r.document.includes(q) || r.programs.some(p => p.name.toLowerCase().includes(q))
  }) ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <label className="min-w-[200px]">
          <span className="block text-xs text-gray-500 mb-1">Categoría</span>
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={inp}>
            <option value="">Seleccionar…</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="min-w-[160px]">
          <span className="block text-xs text-gray-500 mb-1">Año académico</span>
          <select value={yearId} onChange={e => setYearId(e.target.value)} className={inp}>
            {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
          </select>
        </label>
        <label className="flex-1 min-w-[240px]">
          <span className="block text-xs text-gray-500 mb-1">Convocatoria</span>
          <select value={convId} onChange={e => setConvId(e.target.value)} className={inp} disabled={!convs.length}>
            <option value="">{categoryId ? (convs.length ? 'Seleccionar…' : 'Sin convocatorias en este año') : 'Elige categoría y año'}</option>
            {convs.map(c => <option key={c.id} value={c.id}>{c.name} — {c.semester} ({fdate(c.first_day)})</option>)}
          </select>
        </label>
      </div>

      {loading && !data && <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>}

      {notice && (
        <p className={`text-sm px-3 py-2 rounded-lg ${notice.kind === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
          {notice.text}
        </p>
      )}

      {data && (
        <>
          {/* Parte intermedia: sumas por programa */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Matrículas por programa en esta convocatoria</p>
            {data.por_programa.length === 0 ? (
              <p className="text-sm text-gray-400">Sin matrículas asociadas.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {data.por_programa.map(p => (
                  <span key={p.programa} className="inline-flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5 text-sm">
                    <span className="text-gray-700">{p.programa}</span>
                    <span className="font-bold text-blue-700">{p.n}</span>
                    {p.sin_colocar > 0 && <span className="text-[11px] text-amber-600 font-medium">({p.sin_colocar} sin carrusel)</span>}
                  </span>
                ))}
                <span className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5 text-sm">
                  <Users className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-blue-800">{data.estudiantes} estudiantes · {data.matriculas} matrículas</span>
                </span>
                {data.sin_colocar > 0 ? (
                  <span className="inline-flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5 text-sm text-amber-700">
                    ⚠ {data.sin_colocar} sin colocar en carrusel
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-1.5 text-sm text-green-700">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Todas colocadas
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Parte inferior: tabla de estudiantes con colocación */}
          {data.rows.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-gray-700">Estudiantes ({visible.length}{filter ? ` de ${data.rows.length}` : ''})</p>
                <input
                  value={filter} onChange={e => setFilter(e.target.value)}
                  placeholder="Buscar nombre, documento o programa…"
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
                      <th className="text-left px-4 py-3">Estudiante</th>
                      <th className="text-left px-3 py-3">Documento</th>
                      <th className="text-left px-3 py-3">Programa → Carrusel</th>
                      <th className="text-left px-3 py-3">Situación</th>
                      <th className="text-left px-3 py-3">Fecha matrícula</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {visible.map(r => (
                      <tr key={r.student_id} className="hover:bg-gray-50/50 align-top">
                        <td className="px-4 py-2.5 text-gray-800">{r.name}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-500 font-mono">{r.document}</td>
                        <td className="px-3 py-2.5">
                          <div className="space-y-1.5">
                            {r.programs.map(p => {
                              const key = `${r.student_id}|${p.program_id}`
                              return (
                                <div key={p.program_id} className="flex items-center flex-wrap gap-1.5">
                                  <span className="bg-gray-100 text-gray-600 text-[11px] px-2 py-0.5 rounded-full">{p.name}</span>
                                  {p.placed ? (
                                    <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-[11px] px-2 py-0.5 rounded-full">
                                      <CheckCircle2 className="w-3 h-3" />{p.placed.label}
                                      {p.placed.status !== 'activo' && <span className="text-green-500">({p.placed.status})</span>}
                                    </span>
                                  ) : p.pending_payment ? (
                                    <>
                                      <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-[11px] px-2 py-0.5 rounded-full">
                                        💳 Pendiente de pago
                                      </span>
                                      <button
                                        onClick={() => activate(r, p)}
                                        disabled={placing[key]}
                                        title="Activa sin esperar el pago (queda auditado)"
                                        className="inline-flex items-center gap-1 border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-40 text-[11px] px-2.5 py-1 rounded-lg transition-colors"
                                      >
                                        {placing[key] ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRightCircle className="w-3 h-3" />}
                                        Activar
                                      </button>
                                    </>
                                  ) : p.candidates.length === 0 ? (
                                    <span className="text-[11px] text-red-500">sin carruseles en el programa</span>
                                  ) : (
                                    <>
                                      {p.candidates.length > 1 && (
                                        <select
                                          value={choice[key] ?? ''}
                                          onChange={e => setChoice(prev => ({ ...prev, [key]: e.target.value }))}
                                          className="border border-amber-200 bg-amber-50/50 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                          <option value="">Elegir carrusel…</option>
                                          {p.candidates.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                        </select>
                                      )}
                                      <button
                                        onClick={() => place(r, p)}
                                        disabled={placing[key] || (p.candidates.length > 1 && !choice[key])}
                                        className="inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-[11px] px-2.5 py-1 rounded-lg transition-colors"
                                      >
                                        {placing[key] ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRightCircle className="w-3 h-3" />}
                                        {p.candidates.length === 1 ? `Colocar en ${p.candidates[0].label}` : 'Colocar'}
                                      </button>
                                    </>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          {r.situation ? (
                            <span className={`text-[11px] px-2 py-0.5 rounded-full ${SIT_STYLE[r.situation] ?? 'bg-gray-100 text-gray-500'}`}>{r.situation}</span>
                          ) : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-500">{fdate(r.fecha)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="text-[11px] text-gray-400">
            Al colocar, el estudiante entra al carrusel (membresía activa) y se matricula en sus aulas Moodle mapeadas. Los candidatos son las entradas naturales del programa (los carruseles que ningún otro apunta); con varios candidatos (ej. variantes por idioma) la elección es obligatoria.
          </p>
        </>
      )}
    </div>
  )
}

const inp = 'w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400'
