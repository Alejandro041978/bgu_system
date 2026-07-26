'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Trash2, MessageSquare, Send } from 'lucide-react'

interface Comment { id: string; body: string; author_name: string | null; created_at: string }
interface Sale {
  enrollment_id: string; enrollment_date: string | null; status: string | null
  student_name: string; document_number: string | null
  program_name: string | null; category_id: string | null
  advisor_id: string | null; admission_type_id: string | null; commission_amount: number | null
  comments: Comment[]
}
interface Advisor { id: string; full_name: string }
interface AdmType { id: string; category_id: string; name: string; commission: number; active: boolean }

const money = (n: number) => `$${Number(n).toFixed(2)}`
// Fecha de cierre de inscripciones en DD/MM/YYYY (sin desfase de zona horaria)
const fcierre = (d: string | null) => d ? String(d).slice(0, 10).split('-').reverse().join('/') : null

export function AdmissionSales() {
  const [advisors, setAdvisors] = useState<Advisor[]>([])
  const [advisorNames, setAdvisorNames] = useState<Record<string, string>>({})
  const [types, setTypes] = useState<AdmType[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [convId, setConvId] = useState('')
  // Cascade categoría → año → convocatoria (mismo patrón que "Estudiantes por
  // Convocatoria": endpoint /api/convocatorias con datos reales, no parseo).
  const [cats, setCats] = useState<{ id: string; name: string }[]>([])
  const [years, setYears] = useState<{ id: string; name: string }[]>([])
  const [convs, setConvs] = useState<{ id: string; name: string; semester: string; deadline: string | null }[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [yearId, setYearId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Comentarios por venta
  const [openComments, setOpenComments] = useState<string | null>(null)
  const [commentText, setCommentText] = useState('')
  const [sendingComment, setSendingComment] = useState(false)

  const load = useCallback(async (c: string) => {
    setLoading(true)
    const d = await fetch(`/api/sales/admissions${c ? `?convocatoria=${c}` : ''}`).then(r => r.json())
    if (d.error) { setError(d.error); setLoading(false); return }
    setAdvisors(d.advisors ?? []); setAdvisorNames(d.advisor_names ?? {})
    setTypes(d.types ?? []); setSales(d.sales ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { load(convId) }, [convId, load])

  // Catálogos de la cascada (categorías + años reales)
  useEffect(() => {
    fetch('/api/convocatorias').then(r => r.json()).then(d => {
      setCats(d.categories ?? []); setYears(d.years ?? [])
    })
  }, [])

  // Convocatorias de la categoría en el año elegido (semestres → convocatorias)
  useEffect(() => {
    setConvs([]); setConvId('')
    if (!categoryId || !yearId) return
    fetch(`/api/convocatorias?category_id=${categoryId}&year_id=${yearId}`)
      .then(r => r.json()).then(d => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const flat = (d.semesters ?? []).flatMap((s: any) =>
          (s.convocatorias ?? []).map((c: { id: string; name: string; deadline_date: string | null }) => ({ id: c.id, name: c.name, semester: s.name, deadline: c.deadline_date ?? null })))
        setConvs(flat)
      })
  }, [categoryId, yearId])

  async function assign(enrollmentId: string, patch: { advisor_id?: string | null; admission_type_id?: string | null }) {
    const s = sales.find(x => x.enrollment_id === enrollmentId)
    if (!s) return
    const body = {
      enrollment_id: enrollmentId,
      advisor_id: patch.advisor_id !== undefined ? patch.advisor_id : s.advisor_id,
      admission_type_id: patch.admission_type_id !== undefined ? patch.admission_type_id : s.admission_type_id,
    }
    const d = await fetch('/api/sales/admissions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then(r => r.json())
    if (d.error) { setError(d.error); return }
    load(convId)
  }

  async function addComment(enrollmentId: string) {
    if (!commentText.trim()) return
    setSendingComment(true)
    const d = await fetch('/api/sales/admission-comments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enrollment_id: enrollmentId, body: commentText }),
    }).then(r => r.json())
    setSendingComment(false)
    if (d.error) { setError(d.error); return }
    setCommentText('')
    load(convId)
  }

  async function removeComment(id: string) {
    const d = await fetch(`/api/sales/admission-comments?id=${id}`, { method: 'DELETE' }).then(r => r.json())
    if (d.error) { setError(d.error); return }
    load(convId)
  }

  const typeById = useMemo(() => new Map(types.map(t => [t.id, t])), [types])
  const advisorName = (id: string | null) => (id && advisorNames[id]) ?? advisors.find(a => a.id === id)?.full_name ?? 'Sin asesora'

  // ── Cuadro resumen: por asesora, cantidad × comisión de cada tipo = total ──
  const resumen = useMemo(() => {
    const por = new Map<string, { name: string; byType: Map<string, { name: string; count: number; commission: number }>; total: number; ventas: number }>()
    for (const s of sales) {
      const key = s.advisor_id ?? 'sin'
      if (!por.has(key)) por.set(key, { name: s.advisor_id ? advisorName(s.advisor_id) : 'Sin asesora asignada', byType: new Map(), total: 0, ventas: 0 })
      const r = por.get(key)!
      r.ventas++
      if (s.admission_type_id) {
        const t = typeById.get(s.admission_type_id)
        const comm = Number(s.commission_amount ?? t?.commission ?? 0)
        const tk = s.admission_type_id
        if (!r.byType.has(tk)) r.byType.set(tk, { name: t?.name ?? '?', count: 0, commission: comm })
        const bt = r.byType.get(tk)!
        bt.count++
        r.total += comm
      }
    }
    return [...por.entries()].sort((a, b) => b[1].total - a[1].total)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales, types, advisors, advisorNames])

  const totalVentas = sales.length
  const totalComisiones = resumen.reduce((s, [, r]) => s + r.total, 0)

  return (
    <div className="space-y-5">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex justify-between"><span>{error}</span><button onClick={() => setError(null)}>✕</button></div>}

      {/* Filtro en cascada (categoría → año académico → convocatoria) */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm text-gray-600">Categoría</label>
        <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Seleccionar categoría…</option>
          {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <label className="text-sm text-gray-600">Año académico</label>
        <select value={yearId} onChange={e => setYearId(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Seleccionar año…</option>
          {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
        </select>

        <label className="text-sm text-gray-600">Convocatoria</label>
        <select value={convId} onChange={e => setConvId(e.target.value)} disabled={!convs.length}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white max-w-md disabled:bg-gray-50 disabled:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">{categoryId && yearId ? (convs.length ? 'Seleccionar convocatoria…' : 'Sin convocatorias en este año') : 'Elige categoría y año'}</option>
          {convs.map(c => <option key={c.id} value={c.id}>{c.name}{fcierre(c.deadline) ? ` (cierre ${fcierre(c.deadline)})` : ''}</option>)}
        </select>

        {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
      </div>

      {/* Cuadro resumen de comisiones */}
      {convId && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Resumen de comisiones</h3>
            <p className="text-xs text-gray-500">{totalVentas} venta(s) · comisiones {money(totalComisiones)}</p>
          </div>
          {resumen.length === 0 ? <p className="px-4 py-6 text-center text-xs text-gray-400">Sin ventas en esta convocatoria.</p> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <th className="px-4 py-2 text-left">Asesora</th>
                  <th className="px-4 py-2 text-right">Ventas</th>
                  <th className="px-4 py-2 text-left">Detalle por tipo</th>
                  <th className="px-4 py-2 text-right">Total comisiones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {resumen.map(([key, r]) => (
                  <tr key={key} className={key === 'sin' ? 'bg-amber-50/40' : ''}>
                    <td className="px-4 py-2 font-medium text-gray-800">{r.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.ventas}</td>
                    <td className="px-4 py-2 text-xs text-gray-600">
                      {[...r.byType.values()].map((bt, i) => (
                        <span key={i} className="inline-block bg-gray-100 rounded-full px-2 py-0.5 mr-1.5 mb-0.5 tabular-nums">
                          {bt.count} × {money(bt.commission)} {bt.name}
                        </span>
                      ))}
                      {r.byType.size === 0 && <span className="text-gray-400">sin tipo asignado</span>}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">{money(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tabla de ventas */}
      {convId && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <th className="px-4 py-2 text-left">Estudiante</th>
                  <th className="px-4 py-2 text-left">Programa</th>
                  <th className="px-4 py-2 text-left">Fecha</th>
                  <th className="px-4 py-2 text-left">Asesora</th>
                  <th className="px-4 py-2 text-left">Tipo de admisión</th>
                  <th className="px-4 py-2 text-right">Comisión</th>
                  <th className="px-3 py-2 text-center">Notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sales.map(s => {
                  const opciones = types.filter(t => t.category_id === s.category_id && (t.active || t.id === s.admission_type_id))
                  return (
                    <Fragment key={s.enrollment_id}>
                    <tr className="hover:bg-gray-50/50">
                      <td className="px-4 py-2">
                        <span className="text-gray-800">{s.student_name}</span>
                        <span className="block text-[11px] text-gray-400">{s.document_number}</span>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600">{s.program_name}</td>
                      <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{s.enrollment_date ? String(s.enrollment_date).slice(0, 10) : '—'}</td>
                      <td className="px-4 py-2">
                        <select value={s.advisor_id ?? ''} onChange={e => assign(s.enrollment_id, { advisor_id: e.target.value || null })}
                          className={`border rounded-lg px-2 py-1 text-xs bg-white w-44 ${s.advisor_id ? 'border-gray-200 text-gray-700' : 'border-amber-300 text-amber-700'}`}>
                          <option value="">Sin asesora…</option>
                          {advisors.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <select value={s.admission_type_id ?? ''} onChange={e => assign(s.enrollment_id, { admission_type_id: e.target.value || null })}
                          className={`border rounded-lg px-2 py-1 text-xs bg-white w-40 ${s.admission_type_id ? 'border-gray-200 text-gray-700' : 'border-amber-300 text-amber-700'}`}>
                          <option value="">Sin tipo…</option>
                          {opciones.map(t => <option key={t.id} value={t.id}>{t.name} · {money(t.commission)}</option>)}
                        </select>
                        {s.category_id && opciones.length === 0 && <span className="block text-[10px] text-amber-600 mt-0.5">Sin tipos para esta categoría (créalos en la configuración)</span>}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{s.commission_amount != null ? money(s.commission_amount) : '—'}</td>
                      <td className="px-3 py-2 text-center">
                        <button onClick={() => { setOpenComments(v => v === s.enrollment_id ? null : s.enrollment_id); setCommentText('') }}
                          className={`inline-flex items-center gap-1 text-xs rounded-lg px-2 py-1 border ${s.comments.length > 0 ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-400 hover:text-gray-600'}`}>
                          <MessageSquare className="w-3.5 h-3.5" />{s.comments.length || ''}
                        </button>
                      </td>
                    </tr>
                    {openComments === s.enrollment_id && (
                      <tr className="bg-gray-50/60">
                        <td colSpan={7} className="px-6 py-3">
                          <div className="space-y-2 max-w-3xl">
                            {s.comments.length === 0 && <p className="text-xs text-gray-400">Sin comentarios aún.</p>}
                            {s.comments.map(c => (
                              <div key={c.id} className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs">
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="font-medium text-gray-700">{c.author_name ?? '—'}</span>
                                  <span className="flex items-center gap-2 text-[10px] text-gray-400">
                                    {new Date(c.created_at).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                    <button onClick={() => removeComment(c.id)} title="Borrar (solo el autor)" className="text-gray-300 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
                                  </span>
                                </div>
                                <p className="text-gray-600 whitespace-pre-wrap">{c.body}</p>
                              </div>
                            ))}
                            <div className="flex gap-2">
                              <input value={commentText} onChange={e => setCommentText(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment(s.enrollment_id) } }}
                                placeholder="Escribe un comentario…"
                                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                              <button onClick={() => addComment(s.enrollment_id)} disabled={sendingComment || !commentText.trim()}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
                                {sendingComment ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  )
                })}
                {!loading && sales.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-xs text-gray-400">Sin matrículas en esta convocatoria.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!convId && !loading && <p className="text-center text-xs text-gray-400 py-10">Elige una convocatoria para ver sus ventas.</p>}
    </div>
  )
}
