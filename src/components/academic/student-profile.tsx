'use client'

import { useState } from 'react'
import { Loader2, Search, Save, RotateCcw, GraduationCap, User } from 'lucide-react'

interface Found { id: string; name: string; document_number: string | null; email: string | null }
interface Enrollment { id: string; program: string; convocatoria: string | null; fecha: string | null }
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

const SITUACIONES = ['activo', 'egresado', 'IW', 'LOA', 'campus socio']

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
  const [form, setForm] = useState<StudentRow>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

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
    setStudent(d.student)
    setEnrollments(d.enrollments ?? [])
    setForm({
      first_name: d.student.first_name ?? '', last_name: d.student.last_name ?? '',
      second_last_name: d.student.second_last_name ?? '',
      document_type: d.student.document_type ?? '', document_number: d.student.document_number ?? '',
      email: d.student.email ?? '', email_alt: d.student.email_alt ?? '',
      phone_code: d.student.phone_code ?? '',
      phone_local: d.student.phone_local ?? '',
      date_of_birth: d.student.date_of_birth ? String(d.student.date_of_birth).slice(0, 10) : '',
      city: d.student.city ?? '', country: d.student.country ?? '',
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
            <button onClick={() => { setStudent(null); setResults(null); setQuery('') }} className="text-xs text-gray-400 hover:text-gray-600">← Nueva búsqueda</button>
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
                  <input type="email" value={form.email_alt} onChange={e => set('email_alt', e.target.value)} className={inp} />
                ) : (
                  <button onClick={crearCorreo} disabled={saving}
                    className="w-full border border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 rounded-lg px-2.5 py-2 text-sm transition-colors">
                    {saving ? 'Creando…' : '+ Crear correo estudiantil (@blackwell.pro)'}
                  </button>
                )}
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
              <Field label="Ciudad"><input value={form.city} onChange={e => set('city', e.target.value)} className={inp} /></Field>
              <Field label="País">
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
                    {SITUACIONES.map(s => <option key={s} value={s}>{s}</option>)}
                    {form.situation && !SITUACIONES.includes(form.situation) && <option value={form.situation}>{form.situation}</option>}
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

          {/* Matrículas (solo lectura) */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Matrículas</p>
            {enrollments.length === 0 ? (
              <p className="text-sm text-gray-400">Sin matrículas.</p>
            ) : enrollments.map(e => (
              <div key={e.id} className="flex items-center gap-2 text-sm border border-gray-100 rounded-lg px-3 py-2">
                <GraduationCap className="w-4 h-4 text-gray-300 shrink-0" />
                <span className="text-gray-800">{e.program}</span>
                <span className="text-xs text-gray-400 ml-auto">
                  {e.convocatoria ?? 'sin convocatoria'} · {fdate(e.fecha)}
                </span>
              </div>
            ))}
            <p className="text-[11px] text-gray-400">Las matrículas se gestionan en Nueva Matrícula; las notas, en Calificaciones.</p>
          </div>
        </>
      )}
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
