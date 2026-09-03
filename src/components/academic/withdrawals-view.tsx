'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, Plus, Search, X, Undo2, Trash2 } from 'lucide-react'

type Row = {
  id: string; student_id: string; type: 'IW' | 'LOA'; resolution_number: string | null
  withdrawal_date: string; expires_at: string | null; status: string; reason: string | null; note: string | null
  source: string; student_name: string; document_number: string | null; situation: string | null
  enrollment_id?: string | null; program_name?: string | null
  reentry?: { reference: string | null; paid_date: string | null } | null
}
type Student = { id: string; name: string; document_number: string | null; email: string | null }
// Las matrículas del estudiante: el retiro es de UNA de ellas.
type Matricula = { id: string; program: string; convocatoria: string | null; fecha: string | null }

const TYPE: Record<string, { label: string; cls: string }> = {
  IW:  { label: 'IW · Definitivo', cls: 'bg-rose-50 text-rose-700' },
  LOA: { label: 'LOA · Temporal',  cls: 'bg-orange-50 text-orange-700' },
}
const STATUS: Record<string, { label: string; cls: string }> = {
  vigente:       { label: 'Vigente',        cls: 'bg-gray-100 text-gray-700' },
  reincorporado: { label: 'Reincorporado',  cls: 'bg-green-50 text-green-700' },
  convertido_iw: { label: 'Convertido a IW', cls: 'bg-rose-50 text-rose-700' },
}
const fdate = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// El nivel/categoría va codificado en el número de resolución
// (…-IW-BACHELOR, …-IW-DCE). Se lee de ahí para filtrar sin tocar la API.
const LEVELS: { key: string; label: string; token: string }[] = [
  { key: 'BACHELOR',  label: 'Bachelor',  token: 'BACHELOR' },
  { key: 'MASTER',    label: 'Master',    token: 'MASTER' },
  { key: 'DOCTORATE', label: 'Doctorado', token: 'DOCTORATE' },
  { key: 'DCE',       label: 'DCE',       token: 'DCE' },
]
function levelOf(resolution: string | null): string | null {
  const m = (resolution ?? '').toUpperCase().match(/-(?:IW|LOA)-([A-Z]+)/)
  return m ? m[1] : null
}

export function WithdrawalsView() {
  const [rows, setRows] = useState<Row[]>([])
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [level, setLevel] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  // ---------------------------------------------------------------------------
  // La pantalla se abre en el EXPEDIENTE de un estudiante, no en el listado.
  //
  // Hay 515 retiros y la pregunta de todos los días no es "quiénes están
  // retirados" —esa lista no cabe en la cabeza— sino "qué pasó con éste": si el
  // suyo sigue vigente, con qué resolución, si ya se reincorporó una vez. El
  // listado completo sigue estando, detrás de un botón, para los reportes.
  // ---------------------------------------------------------------------------
  const [ficha, setFicha] = useState<Student | null>(null)
  const [verListado, setVerListado] = useState(false)
  const [fq, setFq] = useState('')
  const [fres, setFres] = useState<Student[]>([])

  useEffect(() => {
    if (fq.trim().length < 2) { setFres([]); return }
    const t = setTimeout(async () => {
      const d = await fetch(`/api/students/search?q=${encodeURIComponent(fq)}`).then(r => r.json()).catch(() => ({}))
      setFres(d.students ?? [])
    }, 250)
    return () => clearTimeout(t)
  }, [fq])

  const load = useCallback(async () => {
    // Sin estudiante elegido y sin listado abierto no hay nada que traer: no se
    // piden 515 filas para no mostrarlas.
    if (!ficha && !verListado) { setRows([]); setLoading(false); return }
    setLoading(true)
    const qs = new URLSearchParams()
    if (ficha) qs.set('student_id', ficha.id)
    else {
      if (type) qs.set('type', type)
      if (status) qs.set('status', status)
    }
    const d = await fetch(`/api/academic/withdrawals${qs.toString() ? `?${qs}` : ''}`).then(r => r.json())
    setRows(d.rows ?? []); setLoading(false)
  }, [type, status, ficha, verListado])
  useEffect(() => { load() }, [load])

  // --- Formulario de registro ---
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Student[]>([])
  const [student, setStudent] = useState<Student | null>(null)
  const [matriculas, setMatriculas] = useState<Matricula[]>([])
  const [enrollmentId, setEnrollmentId] = useState('')
  const [form, setForm] = useState({ type: 'LOA' as 'IW' | 'LOA', withdrawal_date: new Date().toISOString().slice(0, 10), resolution_number: '', reason: '', note: '' })

  // Al elegir estudiante: sus matrículas. Con una sola se asume; con varias
  // hay que elegir de cuál se retira.
  useEffect(() => {
    setMatriculas([]); setEnrollmentId('')
    if (!student) return
    let cancelled = false
    fetch(`/api/students/${student.id}`).then(r => r.json()).then(d => {
      if (cancelled) return
      const ms: Matricula[] = (d.enrollments ?? []).map((e: Matricula) => ({ id: e.id, program: e.program, convocatoria: e.convocatoria, fecha: e.fecha }))
      setMatriculas(ms)
      if (ms.length === 1) setEnrollmentId(ms[0].id)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [student])
  const [numberHint, setNumberHint] = useState<string | null>(null)
  const [vigenteWarn, setVigenteWarn] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (q.trim().length < 2) return
    const t = setTimeout(async () => {
      const d = await fetch(`/api/students/search?q=${encodeURIComponent(q)}`).then(r => r.json())
      setResults(d.students ?? [])
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  function onSearchChange(value: string) {
    setQ(value)
    if (value.trim().length < 2) setResults([])
  }

  function clearStudent() {
    setStudent(null); setQ(''); setResults([]); setNumberHint(null)
    setForm(f => ({ ...f, resolution_number: '' }))
  }

  // Al elegir estudiante y matrícula / cambiar tipo o fecha, proponer el
  // consecutivo (la familia del número sale del programa de la matrícula)
  useEffect(() => {
    if (!student) return
    let cancelled = false
    ;(async () => {
      const d = await fetch(`/api/academic/withdrawals/next-number?student_id=${student.id}&type=${form.type}&date=${form.withdrawal_date}${enrollmentId ? `&enrollment_id=${enrollmentId}` : ''}`).then(r => r.json())
      if (cancelled) return
      setForm(f => ({ ...f, resolution_number: d.resolution_number ?? '' }))
      setNumberHint(d.warning ?? null)
    })()
    return () => { cancelled = true }
  }, [student, enrollmentId, form.type, form.withdrawal_date])

  function resetForm() {
    setShowForm(false); setStudent(null); setQ(''); setResults([]); setNumberHint(null); setVigenteWarn(null)
    setForm({ type: 'LOA', withdrawal_date: new Date().toISOString().slice(0, 10), resolution_number: '', reason: '', note: '' })
  }

  // Aviso preventivo: al elegir estudiante, si ya tiene un retiro vigente se
  // muestra en rojo (el POST igual lo rechaza — esta es la cortesía visual).
  useEffect(() => {
    setVigenteWarn(null)
    if (!student) return
    let cancelled = false
    ;(async () => {
      const d = await fetch('/api/academic/withdrawals?status=vigente').then(r => r.json()).catch(() => ({}))
      if (cancelled) return
      // El retiro vigente que estorba es el de ESTA matrícula; uno en otro
      // programa del mismo estudiante no impide retirarlo de este.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v = (d.rows ?? []).find((r: any) => r.student_id === student.id && (!enrollmentId || !r.enrollment_id || r.enrollment_id === enrollmentId))
      if (v?.type === 'IW') {
        setVigenteWarn(`⚠ Esta matrícula ya tiene un retiro IW vigente (${v.resolution_number ?? 'sin resolución'}, ${v.withdrawal_date}). No se puede registrar otro hasta resolverlo (reincorporar o anular).`)
      } else if (v?.type === 'LOA') {
        setVigenteWarn(`⚠ Esta matrícula tiene un LOA vigente (${v.resolution_number ?? 'sin resolución'}, ${v.withdrawal_date}). Puedes registrar un IW — el LOA se cerrará como convertido — pero NO otro LOA.`)
      }
    })()
    return () => { cancelled = true }
  }, [student, enrollmentId])

  async function save() {
    if (!student || !enrollmentId) return
    setSaving(true)
    const res = await fetch('/api/academic/withdrawals', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: student.id, enrollment_id: enrollmentId, ...form }),
    })
    const d = await res.json()
    setSaving(false)
    if (!res.ok) { alert(d.error ?? 'No se pudo registrar'); return }
    resetForm(); load()
  }

  // Reincorporar cierra el retiro y devuelve al estudiante a activo — la
  // situación se recalcula sola en el servidor, porque se deriva de los retiros
  // vigentes y no se escribe a mano.
  //
  // SOLO PARA EL LOA. Un IW no se levanta desde aquí: revertirlo cuesta 35
  // dólares y se pide como trámite de Re-entry, que exige tener el IW vigente
  // para poder solicitarse. La reincorporación ocurre al atender ese trámite ya
  // pagado (Registros › Trámites), y de ahí sale el registro de por qué se
  // levantó. Un botón en esta pantalla sería una puerta que salta el cobro.
  async function reincorporar(r: Row) {
    if (!confirm(
      `¿Reincorporar a ${r.student_name}?\n\n` +
      `El LOA se cierra y el estudiante vuelve a activo.\n` +
      `El registro del retiro se conserva; queda marcado como reincorporado.`)) return

    setSaving(true)
    try {
      const res = await fetch(`/api/academic/withdrawals/${r.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'reincorporado' }),
      })
      const d = await res.json().catch(() => ({ error: `El servidor respondió ${res.status}` }))
      if (!res.ok || d.error) { alert(d.error ?? 'No se pudo reincorporar'); return }
      load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error de red')
    } finally { setSaving(false) }
  }

  // Reversión: el reingreso ADMINISTRATIVO de un IW, sin pago (decisión del
  // usuario, 03/09/2026). No aplica nada desde aquí: crea el caso en el Gestor
  // de IW/Re-Entry, que proyecta igual que un Re-Entry (asignaturas + plan de
  // pagos) y exige vista previa y autorización. La vía del estudiante sigue
  // siendo el trámite Re-entry pagado; esta puerta es solo del personal y deja
  // el mismo rastro de gestión.
  async function reversion(r: Row) {
    if (!confirm(
      `¿Crear la REVERSIÓN del IW de ${r.student_name}?\n\n` +
      `No se aplica nada todavía: el caso queda en el Gestor de IW/Re-Entry, ` +
      `donde verás la proyección (asignaturas y plan de pagos) y decidirás autorizarla o descartarla.\n\n` +
      `Es la vía administrativa sin pago; la del estudiante sigue siendo el trámite Re-entry.`)) return
    setSaving(true)
    try {
      const res = await fetch('/api/academic/withdrawals/reversion', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ withdrawal_id: r.id }),
      })
      const d = await res.json().catch(() => ({ error: `El servidor respondió ${res.status}` }))
      if (!res.ok || d.error) { alert(d.error ?? 'No se pudo crear la Reversión'); return }
      alert(d.mensaje ?? 'Reversión creada: autorízala en el Gestor de IW/Re-Entry.')
      load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error de red')
    } finally { setSaving(false) }
  }

  async function anular(r: Row) {
    if (!confirm(`¿Anular este registro de retiro de ${r.student_name}? Se elimina del historial.`)) return
    await fetch(`/api/academic/withdrawals/${r.id}`, { method: 'DELETE' })
    load()
  }

  // El filtro de nivel se aplica en cliente sobre lo que ya trajo la API
  // (filtrado por tipo/estado). Los conteos por nivel salen de ese mismo conjunto.
  const levelCounts: Record<string, number> = {}
  for (const r of rows) { const l = levelOf(r.resolution_number); if (l) levelCounts[l] = (levelCounts[l] ?? 0) + 1 }
  const visible = level ? rows.filter(r => levelOf(r.resolution_number) === level) : rows

  const SITUACION: Record<string, { label: string; cls: string }> = {
    activo: { label: 'Activo', cls: 'bg-green-50 text-green-700' },
    retiro_permanente: { label: 'Retirado (IW)', cls: 'bg-rose-50 text-rose-700' },
    retiro_temporal: { label: 'En licencia (LOA)', cls: 'bg-orange-50 text-orange-700' },
    egresado: { label: 'Egresado', cls: 'bg-blue-50 text-blue-700' },
    campus_socio: { label: 'Campus socio', cls: 'bg-violet-50 text-violet-700' },
  }
  const situacion = rows[0]?.situation ?? null

  return (
    <div className="space-y-4">
      {/* Buscador — la puerta de entrada */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        {ficha ? (
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-base font-semibold text-gray-900">{ficha.name}</p>
              <p className="text-xs text-gray-400">
                {ficha.document_number ?? ficha.email}
                {situacion && (
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-[11px] font-medium ${SITUACION[situacion]?.cls ?? 'bg-gray-100 text-gray-600'}`}>
                    {SITUACION[situacion]?.label ?? situacion}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setStudent(ficha); setShowForm(true) }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="w-4 h-4" /> Registrar retiro
              </button>
              <button onClick={() => { setFicha(null); setFq(''); setFres([]); setVerListado(false) }}
                className="text-sm text-gray-500 hover:text-gray-800 px-2">Buscar otro</button>
            </div>
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={fq} onChange={e => setFq(e.target.value)} autoFocus
              placeholder="Busca al estudiante por nombre, documento o correo…"
              className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {fres.length > 0 && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-auto">
                {fres.map(s => (
                  <button key={s.id} onClick={() => { setFicha(s); setFres([]); setLevel('') }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                    <p className="text-sm text-gray-800">{s.name}</p>
                    <p className="text-[11px] text-gray-400">{s.document_number ?? s.email}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sin estudiante: ni tabla ni filtros. El listado completo, a un clic. */}
      {!ficha && !verListado && (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl py-16 text-center">
          <p className="text-sm text-gray-500">Busca a un estudiante para ver su historial de retiros y reincorporaciones.</p>
          <button onClick={() => setVerListado(true)} className="mt-3 text-sm text-blue-600 hover:underline">
            o ver el listado completo de retiros
          </button>
        </div>
      )}

      {/* Filtros del listado completo (no aplican a un expediente) */}
      {!ficha && verListado && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex flex-wrap gap-2">
              {[['', 'Todos'], ['IW', 'IW · Definitivos'], ['LOA', 'LOA · Temporales']].map(([k, l]) => (
                <button key={k} onClick={() => setType(k)} className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${type === k ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{l}</button>
              ))}
              <span className="w-px bg-gray-200 mx-1" />
              {[['', 'Todo estado'], ['vigente', 'Vigentes'], ['reincorporado', 'Reincorporados']].map(([k, l]) => (
                <button key={k} onClick={() => setStatus(k)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${status === k ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>{l}</button>
              ))}
            </div>
            <button onClick={() => setVerListado(false)} className="text-sm text-gray-500 hover:text-gray-800">Volver al buscador</button>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-gray-400 uppercase tracking-wide mr-1">Nivel:</span>
              <button onClick={() => setLevel('')} className={`px-3 py-1 rounded-lg text-xs font-medium border ${level === '' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>Todos</button>
              {LEVELS.map(lv => (
                <button key={lv.key} onClick={() => setLevel(lv.key)} className={`px-3 py-1 rounded-lg text-xs font-medium border ${level === lv.key ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                  {lv.label} <span className="opacity-70">({levelCounts[lv.token] ?? 0})</span>
                </button>
              ))}
            </div>
            <span className="text-sm text-gray-500">
              {level ? <><b className="text-gray-800">{visible.length}</b> de {rows.length}</> : <><b className="text-gray-800">{rows.length}</b> retiros</>}
            </span>
          </div>
        </>
      )}

      {/* Encabezado del expediente */}
      {ficha && !loading && (
        <p className="text-sm text-gray-500 px-1">
          {rows.length === 0
            ? 'Sin retiros registrados: nunca se le ha retirado.'
            : <><b className="text-gray-800">{rows.length}</b> {rows.length === 1 ? 'registro' : 'registros'} en su historial · del más reciente al más antiguo</>}
        </p>
      )}

      {showForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-blue-800">Registrar retiro</p>
            <button onClick={resetForm} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>

          {/* Estudiante */}
          {student ? (
            <>
              <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm text-gray-800">{student.name}</p>
                  <p className="text-[11px] text-gray-400">{student.document_number ?? student.email}</p>
                </div>
                <button onClick={clearStudent} className="text-xs text-blue-600 hover:underline">Cambiar</button>
              </div>
              {/* De qué matrícula se retira: el retiro es de la matrícula, no
                  del estudiante. Con una sola se asume; con varias se elige. */}
              <div className="mt-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Matrícula de la que se retira *</label>
                {matriculas.length === 0 ? (
                  <p className="text-xs text-red-600">Este estudiante no tiene matrículas: no hay de qué retirarlo.</p>
                ) : (
                  <select value={enrollmentId} onChange={e => setEnrollmentId(e.target.value)}
                    className={`w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${matriculas.length > 1 && !enrollmentId ? 'border-amber-400' : 'border-gray-300'}`}>
                    {matriculas.length > 1 && <option value="">Elige la matrícula…</option>}
                    {matriculas.map(m => <option key={m.id} value={m.id}>{m.program}{m.convocatoria ? ` · ${m.convocatoria}` : ''}{m.fecha ? ` · ${fdate(String(m.fecha).slice(0, 10))}` : ''}</option>)}
                  </select>
                )}
              </div>
              {vigenteWarn && (
                <p className="mt-2 text-xs bg-red-50 border border-red-100 text-red-700 rounded-lg px-3 py-2">{vigenteWarn}</p>
              )}
            </>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={q} onChange={e => onSearchChange(e.target.value)} placeholder="Buscar estudiante por nombre, documento o correo…"
                className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {results.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-auto">
                  {results.map(s => (
                    <button key={s.id} onClick={() => { setStudent(s); setResults([]) }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                      <p className="text-sm text-gray-800">{s.name}</p>
                      <p className="text-[11px] text-gray-400">{s.document_number ?? s.email}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tipo *</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as 'IW' | 'LOA' }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="LOA">LOA · Retiro temporal (1 semestre)</option>
                <option value="IW">IW · Retiro definitivo</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Fecha *</label>
              <input type="date" value={form.withdrawal_date} onChange={e => setForm(f => ({ ...f, withdrawal_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">N° de resolución</label>
              <input value={form.resolution_number} onChange={e => setForm(f => ({ ...f, resolution_number: e.target.value }))}
                placeholder={student ? 'Generando…' : 'Elige un estudiante'}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          {numberHint && <p className="text-[11px] text-amber-600">{numberHint}</p>}
          {form.type === 'LOA' && <p className="text-[11px] text-gray-500">El LOA vence a los 6 meses. Si no hay reincorporación, se convierte en IW automáticamente.</p>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Motivo</label>
              <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Motivo declarado por el estudiante"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nota interna</label>
              <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                placeholder="Resultado de la llamada, observaciones…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={save} disabled={!student || !enrollmentId || saving}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium rounded-lg">
              {saving ? 'Guardando…' : 'Registrar retiro'}
            </button>
            <button onClick={resetForm} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-white">Cancelar</button>
          </div>
        </div>
      )}

      {!ficha && !verListado ? null : loading ? (
        <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-gray-400 py-10 text-center">
          {ficha ? 'Este estudiante no tiene ningún retiro registrado.' : 'Sin retiros registrados con este filtro.'}
        </p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-[11px] text-gray-400 uppercase tracking-wide">
                {/* En un expediente el nombre ya está arriba: repetirlo en cada
                    fila desplaza a la derecha lo que sí cambia entre retiros. */}
                <th className="text-left px-4 py-2.5">{ficha ? 'Motivo' : 'Estudiante'}</th>
                <th className="text-left px-4 py-2.5">Tipo</th>
                <th className="text-left px-4 py-2.5">N° resolución</th>
                <th className="text-left px-4 py-2.5">Fecha</th>
                <th className="text-left px-4 py-2.5">Vence (LOA)</th>
                <th className="text-left px-4 py-2.5">Estado</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visible.map(r => (
                <tr key={r.id} className="group hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 max-w-[380px] whitespace-normal">
                    {ficha ? (
                      <>
                        <p className="text-gray-800">{r.reason || <span className="text-gray-400 italic">sin motivo declarado</span>}</p>
                        <p className="text-[11px] text-gray-400">{r.program_name ? <span className="text-indigo-600">{r.program_name}</span> : <span className="text-amber-600">sin matrícula enlazada</span>}{r.note ? ` · ${r.note}` : ''}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-gray-800">{r.student_name || 'Estudiante'}</p>
                        <p className="text-[11px] text-gray-400">{r.document_number}{r.program_name ? <> · <span className="text-indigo-600">{r.program_name}</span></> : ''}{r.reason ? ` · ${r.reason}` : ''}</p>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-2.5"><span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${TYPE[r.type]?.cls}`}>{TYPE[r.type]?.label ?? r.type}</span></td>
                  <td className="px-4 py-2.5 text-xs font-mono text-gray-600">{r.resolution_number ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{fdate(r.withdrawal_date)}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{r.type === 'LOA' ? fdate(r.expires_at) : '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS[r.status]?.cls ?? 'bg-gray-100 text-gray-500'}`}>{STATUS[r.status]?.label ?? r.status}</span>
                    {/* Qué Re-entry levantó ESTE retiro. Con dos IW y dos
                        Re-entry en el mismo expediente, sin esto no se sabe
                        cuál fue de cuál. */}
                    {r.status === 'reincorporado' && r.type === 'IW' && (
                      r.reentry
                        ? <span className="block mt-0.5 text-[10px] text-gray-400 font-mono">Re-entry {r.reentry.reference ?? 's/ref'} · {fdate(r.reentry.paid_date)}</span>
                        : (r.note ?? '').includes('Reversión administrativa')
                          ? <span className="block mt-0.5 text-[10px] text-violet-500">por Reversión administrativa</span>
                          : <span className="block mt-0.5 text-[10px] text-amber-500">sin enlace a Re-entry</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* El LOA se levanta directo desde aquí (gratuito).
                          El IW tiene dos vías: la del estudiante (trámite
                          Re-entry pagado, Registros › Trámites) y la
                          REVERSIÓN administrativa (03/09/2026) — que tampoco
                          aplica nada aquí: crea el caso en el Gestor de
                          IW/Re-Entry, con proyección y autorización. */}
                      {r.type === 'LOA' && r.status === 'vigente' && (
                        <button onClick={() => reincorporar(r)} disabled={saving} title="Reincorporar"
                          className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded disabled:opacity-40"><Undo2 className="w-3.5 h-3.5" /></button>
                      )}
                      {r.type === 'IW' && r.status === 'vigente' && (
                        <button onClick={() => reversion(r)} disabled={saving}
                          title="Reversión administrativa: encola el reingreso sin pago en el Gestor de IW/Re-Entry"
                          className="text-[11px] font-medium text-violet-600 hover:text-violet-800 hover:bg-violet-50 rounded px-1.5 py-0.5 disabled:opacity-40">
                          Reversión
                        </button>
                      )}
                      <button onClick={() => anular(r)} title="Anular registro"
                        className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
