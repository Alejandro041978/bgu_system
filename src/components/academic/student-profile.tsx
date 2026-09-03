'use client'

import { useEffect, useState } from 'react'
import { Loader2, Search, Save, RotateCcw, GraduationCap, User, MapPin, Wallet } from 'lucide-react'

// Dónde está (convocatoria + carrusel) y cómo va la cobranza de cada
// matrícula: lo trae el localizador y el estado de cuenta, no se replica aquí.
interface Donde {
  convocatoria: { id: string; name: string; semester: string | null } | null
  carrusel: { label: string; status: string; next_label: string | null } | null
}
interface Cobranza { charged: number; paid: number; balance: number; overdue: number }
const money = (n: number) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

interface Found { id: string; name: string; document_number: string | null; email: string | null }
interface Enrollment {
  id: string; program: string; convocatoria: string | null; fecha: string | null
  program_id: string | null; category_id: string | null; convocatoria_id: string | null
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StudentRow = Record<string, any>

const fdate = (d: string | null) => (d ? d.split('T')[0].split('-').reverse().join('/') : '—')

const PAISES: [string, string][] = [
  ['PER', 'Perú'], ['MEX', 'México'], ['ECU', 'Ecuador'], ['COL', 'Colombia'], ['CHL', 'Chile'],
  ['ARG', 'Argentina'], ['BOL', 'Bolivia'], ['BRA', 'Brasil'], ['CRI', 'Costa Rica'], ['CUB', 'Cuba'],
  ['DOM', 'Rep. Dominicana'], ['SLV', 'El Salvador'], ['ESP', 'España'], ['GTM', 'Guatemala'],
  ['HND', 'Honduras'], ['NIC', 'Nicaragua'], ['PAN', 'Panamá'], ['PRY', 'Paraguay'], ['PRI', 'Puerto Rico'],
  ['URY', 'Uruguay'], ['USA', 'Estados Unidos'], ['VEN', 'Venezuela'], ['CAN', 'Canadá'], ['ITA', 'Italia'],
  ['FRA', 'Francia'], ['DEU', 'Alemania'], ['GBR', 'Reino Unido'],
]

// Los valores que REALMENTE guarda academic_students.situation — los que
// escribe recomputeSituations() y los que leen los reportes, las campañas y el
// requisito de situación de los trámites.
//
// Antes este selector ofrecía otro vocabulario ('IW', 'LOA', 'campus socio'),
// el del dominio y no el de la base. Elegir "IW" a mano guardaba un valor que
// ningún motor produce y que ninguna consulta busca: el estudiante quedaba
// fuera de los reportes de retirados y, peor, fuera de su propio trámite de
// reingreso. Etiqueta y valor no son lo mismo, y aquí se separan.
const SITUACIONES: [string, string][] = [
  ['activo', 'Activo'],
  ['egresado', 'Egresado'],
  ['retiro_permanente', 'Retiro permanente (IW)'],
  ['retiro_temporal', 'Retiro temporal (LOA)'],
  ['campus_socio', 'Campus socio'],
]

export const CODIGOS_TEL: [string, string][] = [
  ['+51', 'Perú'], ['+52', 'México'], ['+593', 'Ecuador'], ['+57', 'Colombia'], ['+56', 'Chile'],
  ['+1', 'USA/Can/Dom/PR'], ['+504', 'Honduras'], ['+503', 'El Salvador'], ['+506', 'Costa Rica'],
  ['+502', 'Guatemala'], ['+507', 'Panamá'], ['+505', 'Nicaragua'], ['+34', 'España'], ['+598', 'Uruguay'],
  ['+595', 'Paraguay'], ['+54', 'Argentina'], ['+58', 'Venezuela'], ['+591', 'Bolivia'], ['+55', 'Brasil'],
  ['+53', 'Cuba'], ['+509', 'Haití'], ['+39', 'Italia'], ['+33', 'Francia'], ['+49', 'Alemania'], ['+44', 'Reino Unido'],
]

export function StudentProfile() {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<Found[] | null>(null)
  const [student, setStudent] = useState<StudentRow | null>(null)
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [donde, setDonde] = useState<Record<string, Donde>>({})
  const [cobranza, setCobranza] = useState<Record<string, Cobranza>>({})
  const [form, setForm] = useState<StudentRow>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  // Enlace directo: /academic/students?id=<uuid> aterriza en la ficha sin
  // buscar — para compartir la ficha entre colaboradores. Al abrir un
  // estudiante, el id se refleja en la URL (copiable tal cual).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id')
    if (id) open(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function search() {
    if (query.trim().length < 2) return
    setSearching(true); setResults(null)
    const d = await fetch(`/api/students/search?q=${encodeURIComponent(query.trim())}`).then(r => r.json())
    setResults(d.students ?? [])
    setSearching(false)
  }

  async function open(id: string) {
    setLoading(true); setStudent(null); setNotice(null)
    const d = await fetch(`/api/students/${id}`).then(r => r.json())
    setLoading(false)
    if (d.error) { setNotice({ kind: 'error', text: d.error }); return }
    window.history.replaceState(null, '', `?id=${id}`)
    setStudent(d.student)
    setEnrollments(d.enrollments ?? [])
    // Carrusel y cobranza por matrícula, en paralelo y sin bloquear la ficha
    setDonde({}); setCobranza({})
    fetch(`/api/academic/student-locator?student_id=${id}`).then(r => r.json()).then(l => {
      const m: Record<string, Donde> = {}
      for (const e of (l.students?.[0]?.enrollments ?? []) as ({ enrollment_id: string } & Donde)[]) m[e.enrollment_id] = { convocatoria: e.convocatoria, carrusel: e.carrusel }
      setDonde(m)
    }).catch(() => {})
    fetch(`/api/account/statement?student_id=${id}`).then(r => r.json()).then(s => {
      const m: Record<string, Cobranza> = {}
      for (const p of (s.programs ?? []) as { enrollment_id: string | null; totals: Cobranza }[]) if (p.enrollment_id) m[p.enrollment_id] = p.totals
      setCobranza(m)
    }).catch(() => {})
    setForm({
      first_name: d.student.first_name ?? '', last_name: d.student.last_name ?? '',
      second_last_name: d.student.second_last_name ?? '',
      document_type: d.student.document_type ?? '', document_number: d.student.document_number ?? '',
      email: d.student.email ?? '', email_alt: d.student.email_alt ?? '',
      phone_code: d.student.phone_code ?? '',
      phone_local: d.student.phone_local ?? '',
      date_of_birth: d.student.date_of_birth ? String(d.student.date_of_birth).slice(0, 10) : '',
      city: d.student.city ?? '', country: d.student.country ?? '', birth_country: d.student.birth_country ?? '',
      situation: d.student.situation ?? '',
    })
  }

  async function save() {
    if (!student) return
    setSaving(true); setNotice(null)
    const res = await fetch(`/api/students/${student.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    const d = await res.json()
    setSaving(false)
    if (d.error) { setNotice({ kind: 'error', text: d.error }); return }
    setNotice({ kind: 'ok', text: 'Ficha guardada' })
    open(student.id)
  }

  async function crearCorreo() {
    if (!student) return
    setSaving(true); setNotice(null)
    const d = await fetch(`/api/students/${student.id}/create-email`, { method: 'POST' }).then(r => r.json())
    setSaving(false)
    if (d.error) { setNotice({ kind: 'error', text: d.error }); return }
    setNotice({
      kind: 'ok',
      text: `Correo creado: ${d.email}${d.notified ? ' — credenciales enviadas a su correo personal' : ` — ⚠ ${d.notify_error ?? 'sin notificar'}`}`,
    })
    open(student.id)
  }

  async function situacionAuto() {
    if (!student) return
    await fetch(`/api/students/${student.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ situacion_auto: true }),
    })
    open(student.id)
  }

  const set = (k: string, v: string) => setForm((p: StudentRow) => ({ ...p, [k]: v }))

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Buscador */}
      <div className="flex gap-2">
        <input value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') search() }}
          placeholder="Buscar por nombre, documento o correo…"
          className={`${inp} flex-1`} />
        <button onClick={search} disabled={searching || query.trim().length < 2}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg">
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Buscar
        </button>
      </div>

      {results !== null && !student && (
        <div className="space-y-1.5">
          {results.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">Sin coincidencias.</p>
          ) : results.map(s => (
            <button key={s.id} onClick={() => { setResults(null); open(s.id) }}
              className="w-full text-left flex items-center justify-between border border-gray-100 hover:border-blue-300 hover:bg-blue-50/40 rounded-lg px-3 py-2 transition-colors">
              <div className="text-sm">
                <p className="text-gray-800">{s.name}</p>
                <p className="text-xs text-gray-400">{s.document_number ?? '—'}{s.email ? ` · ${s.email}` : ''}</p>
              </div>
              <span className="text-xs text-blue-600 font-medium shrink-0 ml-3">Abrir ficha</span>
            </button>
          ))}
        </div>
      )}

      {loading && <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>}

      {notice && (
        <p className={`text-sm px-3 py-2 rounded-lg ${notice.kind === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{notice.text}</p>
      )}

      {student && (
        <>
          {/* Cabecera de la ficha */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center"><User className="w-5 h-5 text-blue-500" /></div>
              <div>
                <p className="font-semibold text-gray-900">{[student.first_name, student.last_name, student.second_last_name].filter(Boolean).join(' ')}</p>
                <p className="text-xs text-gray-400">
                  {student.external_id ? 'Migrado de SystemActiva' : 'Creado en el ERP'}
                  {student.moodle_user_id ? ' · con cuenta Moodle' : ''}
                </p>
              </div>
            </div>
            <button onClick={() => { setStudent(null); setResults(null); setQuery(''); window.history.replaceState(null, '', window.location.pathname) }} className="text-xs text-gray-400 hover:text-gray-600">← Nueva búsqueda</button>
          </div>

          {/* Datos editables */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Datos personales</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Field label="Nombres *"><input value={form.first_name} onChange={e => set('first_name', e.target.value)} className={inp} /></Field>
              <Field label="Primer apellido *"><input value={form.last_name} onChange={e => set('last_name', e.target.value)} className={inp} /></Field>
              <Field label="Segundo apellido"><input value={form.second_last_name} onChange={e => set('second_last_name', e.target.value)} className={inp} /></Field>
              <Field label="Tipo de documento"><input value={form.document_type} onChange={e => set('document_type', e.target.value)} className={inp} /></Field>
              <Field label="Documento *"><input value={form.document_number} onChange={e => set('document_number', e.target.value)} className={inp} /></Field>
              <Field label="Fecha de nacimiento"><input type="date" value={form.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} className={inp} /></Field>
              <Field label="Correo"><input type="email" value={form.email} onChange={e => set('email', e.target.value)} className={inp} /></Field>
              <Field label="Correo institucional">
                {student.email_alt ? (
                  <div className="space-y-1">
                    <input type="email" value={form.email_alt} onChange={e => set('email_alt', e.target.value)} className={inp} />
                    <StudentEmailAccess studentId={student.id} />
                  </div>
                ) : (
                  <button onClick={crearCorreo} disabled={saving}
                    className="w-full border border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 rounded-lg px-2.5 py-2 text-sm transition-colors">
                    {saving ? 'Creando…' : '+ Crear correo estudiantil (@blackwell.pro)'}
                  </button>
                )}
              </Field>
              <Field label="Cuenta del Campus Virtual">
                <MoodleAccount studentId={student.id} />
              </Field>
              <label className="block sm:col-span-3">
                <span className="block text-xs text-gray-500 mb-1">{`Teléfono${student.phone_number ? ` (envíos: ${student.phone_number})` : ''}`}</span>
                <div className="flex gap-1.5">
                  <select value={form.phone_code} onChange={e => set('phone_code', e.target.value)} className={`${inp} !w-44 shrink-0`}>
                    <option value="">Código tel…</option>
                    {CODIGOS_TEL.map(([code, nombre]) => <option key={code} value={code}>{code} {nombre}</option>)}
                    {form.phone_code && !CODIGOS_TEL.some(([c]) => c === form.phone_code) && <option value={form.phone_code}>{form.phone_code}</option>}
                  </select>
                  <input value={form.phone_local} onChange={e => set('phone_local', e.target.value.replace(/\D/g, ''))} placeholder="Número de teléfono" className={`${inp} flex-1`} />
                </div>
              </label>
              <Field label="País de nacimiento">
                <select value={form.birth_country} onChange={e => set('birth_country', e.target.value)} className={inp}>
                  <option value="">—</option>
                  {PAISES.map(([code, nombre]) => <option key={code} value={code}>{nombre}</option>)}
                  {form.birth_country && !PAISES.some(([c]) => c === form.birth_country) && <option value={form.birth_country}>{form.birth_country}</option>}
                </select>
              </Field>
              <Field label="Ciudad"><input value={form.city} onChange={e => set('city', e.target.value)} className={inp} /></Field>
              <Field label="País de residencia">
                <select value={form.country} onChange={e => set('country', e.target.value)} className={inp}>
                  <option value="">—</option>
                  {PAISES.map(([code, nombre]) => <option key={code} value={code}>{nombre}</option>)}
                  {form.country && !PAISES.some(([c]) => c === form.country) && <option value={form.country}>{form.country}</option>}
                </select>
              </Field>
              <Field label={`Situación (${student.situation_source === 'manual' ? 'manual' : 'automática'})`}>
                <div className="flex gap-1.5">
                  <select value={form.situation} onChange={e => set('situation', e.target.value)} className={inp}>
                    <option value="">—</option>
                    {SITUACIONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    {/* Un valor heredado que ya no está en la lista se sigue
                        mostrando: ocultarlo lo cambiaría al guardar sin avisar. */}
                    {form.situation && !SITUACIONES.some(([v]) => v === form.situation) && (
                      <option value={form.situation}>{form.situation} (valor antiguo)</option>
                    )}
                  </select>
                  {student.situation_source === 'manual' && (
                    <button onClick={situacionAuto} title="Volver a situación automática (los motores la recalculan)"
                      className="shrink-0 border border-gray-200 rounded-lg px-2 text-gray-400 hover:text-blue-600"><RotateCcw className="w-3.5 h-3.5" /></button>
                  )}
                </div>
              </Field>
            </div>
            <div className="flex items-center justify-between pt-1">
              <p className="text-[11px] text-gray-400">Cambiar la situación a mano la marca como manual: los motores de egreso/retiro dejan de recalcularla hasta volverla a automática.</p>
              <button onClick={save} disabled={saving}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg shrink-0">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
              </button>
            </div>
          </div>

          {/* Matrículas */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Matrículas</p>
            {enrollments.length === 0 ? (
              <p className="text-sm text-gray-400">Sin matrículas.</p>
            ) : enrollments.map(e => {
              const w = donde[e.id]
              const c = cobranza[e.id]
              return (
                <div key={e.id} className="text-sm border border-gray-100 rounded-lg px-3 py-2 space-y-1">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-gray-300 shrink-0" />
                    <span className="text-gray-800">{e.program}</span>
                    <span className="text-xs text-gray-400 ml-auto">
                      {e.convocatoria ?? 'sin convocatoria'} · {fdate(e.fecha)}
                    </span>
                    <MoverConvocatoria enrollment={e} onMoved={() => open(student!.id)} />
                  </div>
                  {/* Dónde está: carrusel y enlace a la convocatoria */}
                  <div className="flex items-center gap-2 text-xs pl-6">
                    <MapPin className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                    {w === undefined ? (
                      <span className="text-gray-300">…</span>
                    ) : w.carrusel ? (
                      <span className="text-gray-600">
                        Carrusel <span className="font-medium text-gray-800">{w.carrusel.label}</span>
                        <span className={`ml-1 px-1.5 py-0.5 rounded text-[11px] ${w.carrusel.status === 'activo' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{w.carrusel.status}</span>
                        {w.carrusel.next_label && <span className="text-gray-400"> → siguiente {w.carrusel.next_label}</span>}
                      </span>
                    ) : (
                      <span className="text-amber-700">Sin colocar en carrusel</span>
                    )}
                    {e.convocatoria_id && student && (
                      <a href={`/academic/estudiantes-convocatoria?student_id=${student.id}`} className="ml-auto text-blue-600 hover:underline shrink-0">Ver en su convocatoria</a>
                    )}
                  </div>
                  {/* Cobranza: resumen de una línea, el detalle vive en el estado de cuenta */}
                  <div className="flex items-center gap-2 text-xs pl-6">
                    <Wallet className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                    {c === undefined ? (
                      <span className="text-gray-300">…</span>
                    ) : (
                      <span className="text-gray-600">
                        Facturado {money(c.charged)} · pagado <span className="text-green-700">{money(c.paid)}</span>
                        · saldo <span className={c.balance > 0.005 ? 'text-gray-800 font-medium' : 'text-gray-400'}>{money(c.balance)}</span>
                        {c.overdue > 0.005 && <span className="text-red-600 font-medium"> · vencido {money(c.overdue)}</span>}
                      </span>
                    )}
                    {student && (
                      <a href={`/academic/account?student=${student.id}`} className="ml-auto text-blue-600 hover:underline shrink-0">Estado de cuenta</a>
                    )}
                  </div>
                </div>
              )
            })}
            <p className="text-[11px] text-gray-400">Las matrículas se gestionan en Nueva Matrícula; las notas, en Calificaciones.</p>
          </div>

          {/* Estado en vivo en el campus virtual, aula por aula */}
          <MoodleAulas studentId={student.id} />
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Aulas en Moodle — consulta EN VIVO qué accesos tiene el estudiante en el
// campus: en qué aulas su matrícula está activa, en cuáles quedó suspendida
// (la baja por carrusel suspende, no borra) y dónde no cuadra con su carrusel
// actual. Es la vista que evita entrar a Moodle aula por aula para responder
// "¿qué ve este estudiante cuando entra al campus?".
// ---------------------------------------------------------------------------
interface AulaMoodle {
  aula: number; nombre: string; curso_code: string | null; curso_name: string | null
  estado: 'activa' | 'suspendida' | 'sin_matricula'
  esperada: boolean; anomalia: 'acceso_de_mas' | 'acceso_faltante' | null
}
interface EstadoAulas {
  error?: string; sin_cuenta?: boolean; uid?: number
  cuenta?: { suspendida: boolean; ultimo_acceso: number | null } | null
  aulas?: AulaMoodle[]; esperadas_sin_aula?: string[]
}

function MoodleAulas({ studentId }: { studentId: string }) {
  const [st, setSt] = useState<EstadoAulas | null>(null)
  const [loading, setLoading] = useState(true)

  const traer = () => {
    setLoading(true)
    fetch(`/api/academic/moodle-enrolments?student_id=${studentId}`)
      .then(r => r.json())
      .then(setSt)
      .catch(() => setSt({ error: 'No se pudo consultar Moodle' }))
      .finally(() => setLoading(false))
  }
  useEffect(traer, [studentId])

  const chip = (a: AulaMoodle) => a.estado === 'activa'
    ? <span className="px-1.5 py-0.5 rounded text-[11px] bg-green-50 text-green-700">activa</span>
    : a.estado === 'suspendida'
      ? <span className="px-1.5 py-0.5 rounded text-[11px] bg-gray-100 text-gray-500">suspendida</span>
      : <span className="px-1.5 py-0.5 rounded text-[11px] bg-gray-50 text-gray-400">sin matrícula</span>

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-xs text-gray-500 uppercase tracking-wide">Aulas en Moodle (en vivo)</p>
        <button onClick={traer} disabled={loading} title="Volver a consultar Moodle"
          className="ml-auto text-blue-600 hover:text-blue-800 text-xs disabled:opacity-40">
          {loading ? 'Consultando…' : 'Actualizar'}
        </button>
      </div>

      {loading && !st ? (
        <p className="text-sm text-gray-400">Consultando el campus virtual…</p>
      ) : st?.error ? (
        <p className="text-sm text-red-600">{st.error}</p>
      ) : st?.sin_cuenta ? (
        <p className="text-sm text-gray-400">No tiene cuenta en el campus virtual.</p>
      ) : st ? (
        <>
          {st.cuenta && (
            <p className="text-xs text-gray-500">
              Cuenta {st.cuenta.suspendida
                ? <span className="text-red-600 font-medium">suspendida</span>
                : <span className="text-green-700">habilitada</span>}
              {' · '}último acceso: {st.cuenta.ultimo_acceso
                ? new Date(st.cuenta.ultimo_acceso * 1000).toLocaleDateString('es-PE')
                : 'nunca'}
            </p>
          )}
          {(st.aulas ?? []).length === 0 ? (
            <p className="text-sm text-gray-400">Sin aulas conocidas para este estudiante.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-gray-400 uppercase tracking-wide text-left">
                    <th className="py-1 pr-3 font-medium">Aula</th>
                    <th className="py-1 pr-3 font-medium">Asignatura</th>
                    <th className="py-1 pr-3 font-medium">Acceso</th>
                    <th className="py-1 font-medium">Observación</th>
                  </tr>
                </thead>
                <tbody>
                  {(st.aulas ?? []).map(a => (
                    <tr key={a.aula} className="border-t border-gray-100">
                      <td className="py-1.5 pr-3 text-gray-800">{a.nombre}<span className="text-gray-300 text-xs"> · {a.aula}</span></td>
                      <td className="py-1.5 pr-3 text-gray-600">{a.curso_code ? `${a.curso_code} — ${a.curso_name}` : <span className="text-gray-300">sin vínculo</span>}</td>
                      <td className="py-1.5 pr-3">{chip(a)}</td>
                      <td className="py-1.5">
                        {a.anomalia === 'acceso_de_mas' && <span className="text-amber-700 text-xs">Activa, pero no es de su carrusel actual</span>}
                        {a.anomalia === 'acceso_faltante' && <span className="text-red-600 text-xs">Su carrusel la requiere y no tiene acceso</span>}
                        {!a.anomalia && a.esperada && <span className="text-gray-400 text-xs">de su carrusel actual</span>}
                        {!a.anomalia && !a.esperada && a.estado === 'suspendida' && <span className="text-gray-400 text-xs">acceso retirado (notas conservadas)</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(st.esperadas_sin_aula ?? []).length > 0 && (
            <p className="text-[11px] text-amber-700">
              Asignaturas de su carrusel sin aula asignada en su colección: {(st.esperadas_sin_aula ?? []).join(', ')} — se corrige en Colecciones de aulas.
            </p>
          )}
          <p className="text-[11px] text-gray-400">
            Consulta en vivo al campus. «Suspendida» = matriculado sin acceso (sus calificaciones se conservan); es el estado normal de las aulas de carruseles ya completados.
          </p>
        </>
      ) : null}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  )
}

const inp = 'w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

// Estado de la cuenta @blackwell.pro y reenvío de credenciales.
//
// El reenvío solo tiene sentido mientras el estudiante NO haya entrado: la
// contraseña no se guarda en ninguna parte, así que "reenviar" significa emitir
// una nueva. Si ya entró, esa nueva contraseña le quitaría el acceso que ya
// tiene — por eso el botón desaparece y en su lugar se dice qué hacer.
function StudentEmailAccess({ studentId }: { studentId: string }) {
  const [st, setSt] = useState<{
    exists: boolean; everLoggedIn: boolean; lastLoginTime: string | null; suspended: boolean
    recoveryEmail: string | null; recoveryPhone: string | null
    email: string; personal_email: string | null
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    setLoading(true)
    fetch(`/api/students/${studentId}/student-email-access`)
      .then(r => r.json())
      .then(d => { if (vivo) { if (d.error) setErr(d.error); else setSt(d) } })
      .catch(() => { if (vivo) setErr('No se pudo consultar Google') })
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [studentId])

  async function emitir(accion: 'reenviar' | 'restablecer') {
    // Restablecer le quita la contraseña que está usando: se pregunta antes.
    if (accion === 'restablecer' && !confirm(
      `Correo estudiantil ${st?.email ?? '@blackwell.pro'}\n\n`
      + `Se le asignará una contraseña temporal NUEVA y la que usa hoy dejará de funcionar.\n`
      + `Su acceso al Campus Virtual (Moodle) NO cambia.\n\n`
      + `Las credenciales se enviarán a ${st?.personal_email ?? 'su correo personal'}.\n\n¿Continuar?`
    )) return
    setBusy(true); setMsg(null); setErr(null)
    const res = await fetch(`/api/students/${studentId}/student-email-access`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion }),
    })
    const d = await res.json()
    setBusy(false)
    if (!res.ok) { setErr(d.error ?? 'No se pudo emitir la contraseña'); return }
    setMsg(`Contraseña nueva de ${d.email} enviada a ${d.sent_to}`)
  }

  if (loading) return <p className="text-[11px] text-gray-400">Consultando estado de la cuenta…</p>
  if (err && !st) return <p className="text-[11px] text-amber-600">{err}</p>
  if (!st) return null

  return (
    <div className="space-y-1">
      {st.everLoggedIn ? (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-gray-500">
              ✓ Ya usó su cuenta{st.lastLoginTime ? ` (último acceso: ${new Date(st.lastLoginTime).toLocaleDateString('es-PE')})` : ''}.
              {st.recoveryEmail || st.recoveryPhone
                ? ' Si olvidó la contraseña, puede recuperarla él mismo.'
                : ' Sin datos de recuperación: no puede recuperarla solo.'}
            </span>
            <button onClick={() => emitir('restablecer')} disabled={busy || !st.personal_email}
              className="text-[11px] font-medium text-amber-700 hover:underline disabled:opacity-40 disabled:no-underline"
              title={st.personal_email ? `Enviar a ${st.personal_email}` : 'No tiene correo personal donde enviarlo'}>
              {busy ? 'Restableciendo…' : 'Restablecer contraseña del correo'}
            </button>
          </div>
          <p className="text-[10.5px] text-gray-400 leading-relaxed">
            Contraseña temporal nueva para su cuenta <b>@blackwell.pro</b> —la que usa hoy deja de funcionar—
            enviada a su correo personal. No toca su acceso al Campus Virtual.
          </p>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-amber-600">Nunca ha entrado a su cuenta.</span>
            <button onClick={() => emitir('reenviar')} disabled={busy || !st.personal_email}
              className="text-[11px] font-medium text-blue-600 hover:underline disabled:opacity-40 disabled:no-underline"
              title={st.personal_email ? `Enviar a ${st.personal_email}` : 'No tiene correo personal donde enviarlo'}>
              {busy ? 'Enviando…' : 'Enviar credenciales del correo'}
            </button>
          </div>
          <p className="text-[10.5px] text-gray-400 leading-relaxed">
            Contraseña temporal nueva para su cuenta <b>@blackwell.pro</b> (la original no se guarda),
            enviada a su correo personal. No toca su acceso al Campus Virtual.
          </p>
        </>
      )}
      {st.suspended && <p className="text-[11px] text-red-600">La cuenta está suspendida en Google.</p>}
      {msg && <p className="text-[11px] text-green-600">{msg}</p>}
      {err && <p className="text-[11px] text-red-600">{err}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cuenta del Campus Virtual (Moodle).
//
// Tres casos, y el botón se comporta distinto en cada uno:
//   a) Con derecho a correo estudiantil → la cuenta nace con el @blackwell.pro,
//      y hasta que ese correo no exista el botón no deja crearla.
//   b) Sin derecho, programa en nuestro campus → con el correo personal.
//   c) Campus externo → no corresponde, y se dice.
//
// La contraseña de primer uso no se guarda: "reenviar" emite una nueva y la
// anterior deja de servir. Es el mismo criterio del correo estudiantil.
// ---------------------------------------------------------------------------
interface EstadoMoodle {
  caso: 'a' | 'b' | 'c'; motivo: string; corresponde: boolean
  usuario: string | null; falta_correo_estudiantil: boolean
  tiene_cuenta: boolean; moodle_user_id: string | null
  credenciales_enviadas_a: string | null; credenciales_enviadas_el: string | null
}

function MoodleAccount({ studentId }: { studentId: string }) {
  const [st, setSt] = useState<EstadoMoodle | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const traer = () => {
    setLoading(true)
    fetch(`/api/academic/moodle-account?student_id=${studentId}`)
      .then(r => r.json())
      .then(d => { if (d.error) setErr(d.error); else { setSt(d); setErr(null) } })
      .catch(() => setErr('No se pudo consultar el estado'))
      .finally(() => setLoading(false))
  }
  useEffect(traer, [studentId])

  const actuar = async (accion: 'crear' | 'reenviar') => {
    setBusy(true); setMsg(null); setErr(null)
    try {
      const r = await fetch('/api/academic/moodle-account', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, accion }),
      })
      const d = await r.json()
      if (!r.ok) setErr(d.error ?? 'No se pudo completar')
      else { setMsg(`${d.nota} Usuario: ${d.usuario}`); traer() }
    } catch { setErr('No se pudo completar') }
    setBusy(false)
  }

  if (loading) return <p className="text-xs text-gray-400">Consultando…</p>
  if (err && !st) return <p className="text-xs text-red-600">{err}</p>
  if (!st) return null

  if (!st.corresponde) {
    return <p className="text-xs text-gray-500">No corresponde — {st.motivo.toLowerCase()}.</p>
  }

  return (
    <div className="space-y-1.5">
      {st.tiene_cuenta ? (
        <p className="text-xs text-gray-600">
          Cuenta creada · usuario <span className="font-medium">{st.usuario}</span>
          {st.credenciales_enviadas_el && (
            <span className="block text-gray-400">
              credenciales enviadas a {st.credenciales_enviadas_a} el {new Date(st.credenciales_enviadas_el).toLocaleDateString('es-PE')}
            </span>
          )}
        </p>
      ) : st.falta_correo_estudiantil ? (
        <p className="text-xs text-amber-700">
          Primero hay que crear su correo estudiantil: la cuenta del campus debe nacer con él.
        </p>
      ) : (
        <p className="text-xs text-gray-500">Sin cuenta · se creará con {st.usuario}</p>
      )}

      <div className="flex gap-2">
        {!st.tiene_cuenta && !st.falta_correo_estudiantil && (
          <button onClick={() => actuar('crear')} disabled={busy}
            className="border border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 rounded-lg px-2.5 py-1.5 text-xs transition-colors disabled:opacity-50">
            {busy ? 'Creando…' : '+ Crear cuenta del campus'}
          </button>
        )}
        {st.tiene_cuenta && (
          <button onClick={() => actuar('reenviar')} disabled={busy}
            className="border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg px-2.5 py-1.5 text-xs transition-colors disabled:opacity-50">
            {busy ? 'Enviando…' : 'Reenviar credenciales del campus'}
          </button>
        )}
      </div>

      {msg && <p className="text-xs text-green-700">{msg}</p>}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  )
}

// ── Mover una matrícula de convocatoria ────────────────────────────────────
//
// El caso: el estudiante se matricula y pide no empezar este mes sino más
// adelante. No cambia lo que estudia ni lo que debe —cambia cuándo empieza—,
// así que se corren los vencimientos pendientes al calendario del nuevo
// llamado. Los importes no se tocan: para eso está Refacturar cuotas.
//
// Siempre en dos pasos. La vista previa dice qué fecha tendrá cada cuota y qué
// cuotas NO se mueven (las que ya tienen pago, descuento o un trámite encima),
// porque mover una matrícula sin ver eso antes es firmar a ciegas.
interface Conv { id: string; name: string; first_day: string | null }
interface Preview {
  ok?: boolean; error?: string; de?: string; a?: string; regla?: string
  mueve?: { external_id: string; amount: number; de: string; a: string }[]
  quietas?: { external_id: string; amount: number; due_date: string | null; motivo: string }[]
}

function MoverConvocatoria({ enrollment, onMoved }: { enrollment: Enrollment; onMoved: () => void }) {
  const [abierto, setAbierto] = useState(false)
  const [years, setYears] = useState<{ id: string; name: string }[]>([])
  const [yearId, setYearId] = useState('')
  const [convs, setConvs] = useState<Conv[]>([])
  const [destino, setDestino] = useState('')
  const [prev, setPrev] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    fetch('/api/convocatorias').then(r => r.json())
      .then(d => setYears(d.years ?? [])).catch(() => {})
  }, [abierto])

  // Las convocatorias salen del API por categoría y año — nunca de leer el
  // nombre, que no es un dato estructurado.
  useEffect(() => {
    if (!yearId || !enrollment.category_id) { setConvs([]); return }
    fetch(`/api/convocatorias?category_id=${enrollment.category_id}&year_id=${yearId}`)
      .then(r => r.json())
      .then(d => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const todas: Conv[] = (d.semesters ?? []).flatMap((s: any) => s.convocatorias ?? [])
        setConvs(todas.filter(c => c.id !== enrollment.convocatoria_id))
      }).catch(() => {})
  }, [yearId, enrollment.category_id, enrollment.convocatoria_id])

  async function pedir(apply: boolean) {
    setBusy(true); setErr(null)
    const d = await fetch('/api/admision/matricula/mover', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enrollment_id: enrollment.id, convocatoria_id: destino, apply }),
    }).then(r => r.json()).catch(() => ({ error: 'Error de red' }))
    setBusy(false)
    if (d.error) { setErr(d.error); setPrev(null); return }
    if (apply) { setAbierto(false); setPrev(null); setDestino(''); onMoved(); return }
    setPrev(d)
  }

  return (
    <>
      <button onClick={() => { setAbierto(true); setPrev(null); setErr(null) }}
        title="Mover a otra convocatoria" className="text-blue-600 hover:text-blue-800 text-xs shrink-0">
        Mover
      </button>
      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setAbierto(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl p-5" onClick={ev => ev.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900">Mover de convocatoria</h3>
            <p className="text-xs text-gray-500 mt-1">
              {enrollment.program} · actualmente en <strong>{enrollment.convocatoria ?? 'sin convocatoria'}</strong>.
              Los importes no cambian; se corren los vencimientos pendientes.
            </p>

            <div className="flex gap-2 mt-4">
              <select value={yearId} onChange={ev => { setYearId(ev.target.value); setDestino(''); setPrev(null) }}
                className="border rounded-lg px-2 py-1.5 text-sm flex-1">
                <option value="">Año académico…</option>
                {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
              </select>
              <select value={destino} onChange={ev => { setDestino(ev.target.value); setPrev(null) }}
                disabled={!convs.length} className="border rounded-lg px-2 py-1.5 text-sm flex-1 disabled:bg-gray-50">
                <option value="">{yearId && !convs.length ? 'Sin convocatorias' : 'Convocatoria destino…'}</option>
                {convs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {prev && (
              <div className="mt-4 text-sm space-y-2 max-h-72 overflow-y-auto">
                <p className="text-xs text-gray-500">{prev.regla}</p>
                {(prev.mueve ?? []).length === 0
                  ? <p className="text-gray-500">Ninguna cuota cambia de fecha.</p>
                  : (prev.mueve ?? []).map(m => (
                    <div key={m.external_id} className="flex items-center gap-2 text-xs">
                      <span className="text-gray-700 w-20 tabular-nums">${m.amount.toFixed(2)}</span>
                      <span className="text-gray-400">{fdate(m.de)}</span>
                      <span className="text-gray-300">→</span>
                      <span className="text-gray-900 font-medium">{fdate(m.a)}</span>
                    </div>
                  ))}
                {(prev.quietas ?? []).length > 0 && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-[11px] text-amber-700 mb-1">No se mueven:</p>
                    {(prev.quietas ?? []).map(q => (
                      <p key={q.external_id} className="text-[11px] text-gray-500">
                        ${q.amount.toFixed(2)} · {fdate(q.due_date)} — {q.motivo}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
            {err && <p className="text-xs text-red-600 mt-3">{err}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setAbierto(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">Cancelar</button>
              {!prev ? (
                <button onClick={() => pedir(false)} disabled={busy || !destino}
                  className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg disabled:opacity-40">
                  {busy ? 'Calculando…' : 'Ver qué cambia'}
                </button>
              ) : (
                <button onClick={() => pedir(true)} disabled={busy}
                  className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-40">
                  {busy ? 'Moviendo…' : 'Mover matrícula'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
