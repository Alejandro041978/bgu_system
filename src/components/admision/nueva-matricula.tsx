'use client'

import { useEffect, useState } from 'react'
import { Loader2, Search, UserPlus, CheckCircle2, GraduationCap, X } from 'lucide-react'

interface Ref { id: string; name: string }
interface Program { id: string; name: string; category_id: string | null }
interface Conv { id: string; name: string; semester: string; first_day: string | null }
interface Found { id: string; name: string; document: string; email: string | null; situation: string | null; programs: string[] }

const fdate = (d: string | null) => (d ? d.split('T')[0].split('-').reverse().join('/') : '—')
const EMPTY_NEW = { first_name: '', last_name: '', second_last_name: '', document_number: '', email: '', phone_code: '', phone_local: '', city: '', country: '' }

const CODIGOS_TEL: [string, string][] = [
  ['+51', 'Perú'], ['+52', 'México'], ['+593', 'Ecuador'], ['+57', 'Colombia'], ['+56', 'Chile'],
  ['+1', 'USA/Can/Dom/PR'], ['+504', 'Honduras'], ['+503', 'El Salvador'], ['+506', 'Costa Rica'],
  ['+502', 'Guatemala'], ['+507', 'Panamá'], ['+505', 'Nicaragua'], ['+34', 'España'], ['+598', 'Uruguay'],
  ['+595', 'Paraguay'], ['+54', 'Argentina'], ['+58', 'Venezuela'], ['+591', 'Bolivia'], ['+55', 'Brasil'],
  ['+53', 'Cuba'], ['+509', 'Haití'], ['+39', 'Italia'], ['+33', 'Francia'], ['+49', 'Alemania'], ['+44', 'Reino Unido'],
]

// Códigos ISO-3, el mismo formato que trae el sync de SystemActiva
const PAISES: [string, string][] = [
  ['PER', 'Perú'], ['MEX', 'México'], ['ECU', 'Ecuador'], ['COL', 'Colombia'], ['CHL', 'Chile'],
  ['ARG', 'Argentina'], ['BOL', 'Bolivia'], ['BRA', 'Brasil'], ['CRI', 'Costa Rica'], ['CUB', 'Cuba'],
  ['DOM', 'Rep. Dominicana'], ['SLV', 'El Salvador'], ['ESP', 'España'], ['GTM', 'Guatemala'],
  ['HND', 'Honduras'], ['NIC', 'Nicaragua'], ['PAN', 'Panamá'], ['PRY', 'Paraguay'], ['PRI', 'Puerto Rico'],
  ['URY', 'Uruguay'], ['USA', 'Estados Unidos'], ['VEN', 'Venezuela'], ['CAN', 'Canadá'], ['ITA', 'Italia'],
  ['FRA', 'Francia'], ['DEU', 'Alemania'], ['GBR', 'Reino Unido'],
]

export function NuevaMatricula() {
  // Paso 1: estudiante
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<Found[] | null>(null)
  const [selected, setSelected] = useState<Found | null>(null)
  const [creating, setCreating] = useState(false)
  const [newStudent, setNewStudent] = useState(EMPTY_NEW)

  // Paso 2: programa + convocatoria
  const [categories, setCategories] = useState<Ref[]>([])
  const [years, setYears] = useState<Ref[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [convs, setConvs] = useState<Conv[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [yearId, setYearId] = useState('')
  const [convId, setConvId] = useState('')
  const [programId, setProgramId] = useState('')
  const [enrollDate, setEnrollDate] = useState(new Date().toISOString().slice(0, 10))

  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; lines: string[] } | null>(null)

  useEffect(() => {
    fetch('/api/convocatorias').then(r => r.json()).then(d => {
      setCategories(d.categories ?? []); setYears(d.years ?? [])
      if ((d.years ?? []).length) setYearId(d.years[0].id)
    })
    fetch('/api/admision/matricula').then(r => r.json()).then(d => setPrograms(d.programs ?? []))
  }, [])

  useEffect(() => {
    setConvs([]); setConvId(''); setProgramId('')
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

  async function search() {
    if (!query.trim()) return
    setSearching(true); setResults(null); setSelected(null); setCreating(false)
    const d = await fetch(`/api/admision/matricula?q=${encodeURIComponent(query.trim())}`).then(r => r.json())
    setResults(d.students ?? [])
    setSearching(false)
  }

  const catPrograms = programs.filter(p => p.category_id === categoryId)
  const studentReady = !!selected || (creating && newStudent.first_name.trim() && newStudent.last_name.trim() && newStudent.document_number.trim())
  const canSubmit = studentReady && programId && convId && !saving

  async function submit() {
    if (!canSubmit) return
    setSaving(true); setNotice(null)
    const res = await fetch('/api/admision/matricula', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: selected?.id,
        new_student: creating ? newStudent : undefined,
        program_id: programId,
        convocatoria_id: convId,
        enrollment_date: enrollDate,
      }),
    })
    const d = await res.json()
    setSaving(false)
    if (!res.ok || d.error) {
      setNotice({ kind: 'error', lines: [d.error ?? 'Error al matricular'] })
      return
    }
    const lines = [
      d.enrollment_repaired
        ? `Matrícula existente subsanada: se le asignó la convocatoria ${d.convocatoria} en ${d.program} (conserva su fecha original).`
        : `${d.student_created ? 'Estudiante creado y matriculado' : 'Matriculado'} en ${d.program} — ${d.convocatoria}.`,
      d.student_email?.ok
        ? `Correo estudiantil: ${d.student_email.email}${d.student_email.notified ? ' (credenciales enviadas a su correo personal)' : d.student_email.note ? ` (${d.student_email.note})` : ' — ⚠ no se pudo notificar, entrega las credenciales por otro canal'}`
        : `Correo estudiantil: pendiente — ${d.student_email?.note ?? 'crear desde la Ficha del Estudiante'}`,
      d.placement?.ok
        ? `Carrusel: colocado en ${d.placement.group_label ?? 'la entrada del programa'} (con acceso a sus aulas Moodle).`
        : `Carrusel: ${d.placement?.note ?? 'sin colocar'} — puedes colocarlo en Estudiantes por Convocatoria.`,
    ]
    setNotice({ kind: 'ok', lines })
    // Listo para la siguiente matrícula
    setSelected(null); setCreating(false); setNewStudent(EMPTY_NEW)
    setResults(null); setQuery(''); setProgramId('')
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {notice && (
        <div className={`text-sm px-4 py-3 rounded-xl space-y-0.5 ${notice.kind === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-600'}`}>
          {notice.lines.map((l, i) => <p key={i}>{l}</p>)}
        </div>
      )}

      {/* Paso 1: estudiante */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <p className="text-xs text-gray-500 uppercase tracking-wide">1 · Estudiante</p>

        {selected ? (
          <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
            <div className="text-sm">
              <p className="font-medium text-blue-900">{selected.name}</p>
              <p className="text-xs text-blue-700">
                {selected.document}{selected.email ? ` · ${selected.email}` : ''}
                {selected.programs.length > 0 && ` · ya matriculado en: ${selected.programs.join(', ')}`}
              </p>
            </div>
            <button onClick={() => setSelected(null)} className="text-blue-300 hover:text-red-500" title="Quitar"><X className="w-4 h-4" /></button>
          </div>
        ) : creating ? (
          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input placeholder="Nombres *" value={newStudent.first_name} onChange={e => setNewStudent(p => ({ ...p, first_name: e.target.value }))} className={inp} />
              <input placeholder="Primer apellido *" value={newStudent.last_name} onChange={e => setNewStudent(p => ({ ...p, last_name: e.target.value }))} className={inp} />
              <input placeholder="Segundo apellido" value={newStudent.second_last_name} onChange={e => setNewStudent(p => ({ ...p, second_last_name: e.target.value }))} className={inp} />
              <input placeholder="Documento *" value={newStudent.document_number} onChange={e => setNewStudent(p => ({ ...p, document_number: e.target.value }))} className={inp} />
              <input placeholder="Correo" type="email" value={newStudent.email} onChange={e => setNewStudent(p => ({ ...p, email: e.target.value }))} className={inp} />
              <select value={newStudent.phone_code} onChange={e => setNewStudent(p => ({ ...p, phone_code: e.target.value }))} className={inp}>
                <option value="">Código telefónico…</option>
                {CODIGOS_TEL.map(([code, nombre]) => <option key={code} value={code}>{code} {nombre}</option>)}
              </select>
              <input placeholder="Número de teléfono" value={newStudent.phone_local} onChange={e => setNewStudent(p => ({ ...p, phone_local: e.target.value.replace(/\D/g, '') }))} className={inp} />
              <input placeholder="Ciudad" value={newStudent.city} onChange={e => setNewStudent(p => ({ ...p, city: e.target.value }))} className={inp} />
              <select value={newStudent.country} onChange={e => setNewStudent(p => ({ ...p, country: e.target.value }))} className={inp}>
                <option value="">País…</option>
                {PAISES.map(([code, nombre]) => <option key={code} value={code}>{nombre}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-gray-400">El correo se usa para vincular o crear su cuenta de Moodle: recomendable llenarlo.</p>
              <button onClick={() => { setCreating(false); setNewStudent(EMPTY_NEW) }} className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                value={query} onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') search() }}
                placeholder="Buscar por nombre, documento o correo…"
                className={`${inp} flex-1`}
              />
              <button onClick={search} disabled={searching || !query.trim()}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg">
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Buscar
              </button>
            </div>

            {results !== null && (
              <div className="space-y-1.5">
                {results.length === 0 ? (
                  <p className="text-sm text-gray-400 py-2">Sin coincidencias.</p>
                ) : results.map(s => (
                  <button key={s.id} onClick={() => setSelected(s)}
                    className="w-full text-left flex items-center justify-between border border-gray-100 hover:border-blue-300 hover:bg-blue-50/40 rounded-lg px-3 py-2 transition-colors">
                    <div className="text-sm">
                      <p className="text-gray-800">{s.name}</p>
                      <p className="text-xs text-gray-400">
                        {s.document}{s.email ? ` · ${s.email}` : ''}
                        {s.programs.length > 0 && <span className="text-amber-600"> · matriculado en: {s.programs.join(', ')}</span>}
                      </p>
                    </div>
                    <span className="text-xs text-blue-600 font-medium shrink-0 ml-3">Seleccionar</span>
                  </button>
                ))}
                <button onClick={() => setCreating(true)}
                  className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium pt-1">
                  <UserPlus className="w-4 h-4" /> No está: crear estudiante nuevo
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Paso 2: programa + convocatoria */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <p className="text-xs text-gray-500 uppercase tracking-wide">2 · Programa y convocatoria</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label>
            <span className="block text-xs text-gray-500 mb-1">Categoría</span>
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={inp}>
              <option value="">Seleccionar…</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>
            <span className="block text-xs text-gray-500 mb-1">Programa</span>
            <select value={programId} onChange={e => setProgramId(e.target.value)} className={inp} disabled={!categoryId}>
              <option value="">{categoryId ? 'Seleccionar…' : 'Elige categoría'}</option>
              {catPrograms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>
            <span className="block text-xs text-gray-500 mb-1">Año académico</span>
            <select value={yearId} onChange={e => setYearId(e.target.value)} className={inp}>
              {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </label>
          <label>
            <span className="block text-xs text-gray-500 mb-1">Convocatoria</span>
            <select value={convId} onChange={e => setConvId(e.target.value)} className={inp} disabled={!convs.length}>
              <option value="">{categoryId ? (convs.length ? 'Seleccionar…' : 'Sin convocatorias en este año') : 'Elige categoría y año'}</option>
              {convs.map(c => <option key={c.id} value={c.id}>{c.name} — {c.semester} ({fdate(c.first_day)})</option>)}
            </select>
          </label>
          <label>
            <span className="block text-xs text-gray-500 mb-1">Fecha de matrícula</span>
            <input type="date" value={enrollDate} onChange={e => setEnrollDate(e.target.value)} className={inp} />
          </label>
        </div>
      </div>

      <button onClick={submit} disabled={!canSubmit}
        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <GraduationCap className="w-4 h-4" />}
        Matricular
      </button>

      <p className="text-[11px] text-gray-400 flex items-start gap-1.5">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Al matricular, si el programa tiene un único carrusel de entrada el estudiante se coloca automáticamente (con acceso a sus aulas Moodle). Si hay varias variantes, la colocación se hace en Estudiantes por Convocatoria.
      </p>
    </div>
  )
}

const inp = 'w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400'
