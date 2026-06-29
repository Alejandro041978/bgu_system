'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Mail, Phone, MapPin, FileText, CheckCircle2, AlertCircle, Clock, Pencil, X, Save, GraduationCap } from 'lucide-react'
import Link from 'next/link'

type Employee = {
  id: string
  full_name: string
  email: string
  phone: string | null
  position: string | null
  employee_type: 'direct' | 'contractor' | 'external'
  document_type: string | null
  document_number: string | null
  birth_date: string | null
  address: string | null
  notes: string | null
  user_id: string | null
  created_at: string
  active_contract_id: string | null
  active_position: string | null
  contract_count: number
  is_faculty: boolean | null
}

const TYPE_LABEL: Record<string, string> = {
  direct: 'Empleado directo', contractor: 'Contratista', external: 'Externo',
}
const TYPE_COLOR: Record<string, string> = {
  direct: 'bg-blue-100 text-blue-700',
  contractor: 'bg-purple-100 text-purple-700',
  external: 'bg-orange-100 text-orange-700',
}
const DOC_LABEL: Record<string, string> = {
  dni: 'DNI', passport: 'Pasaporte', ce: 'Carnet de Extranjería', other: 'Otro',
}
const PHONE_PREFIXES = [
  { code: '+51', flag: '🇵🇪' }, { code: '+57', flag: '🇨🇴' }, { code: '+56', flag: '🇨🇱' },
  { code: '+54', flag: '🇦🇷' }, { code: '+52', flag: '🇲🇽' }, { code: '+58', flag: '🇻🇪' },
  { code: '+593', flag: '🇪🇨' }, { code: '+591', flag: '🇧🇴' }, { code: '+595', flag: '🇵🇾' },
  { code: '+598', flag: '🇺🇾' }, { code: '+1', flag: '🇺🇸' }, { code: '+34', flag: '🇪🇸' },
]

function splitPhone(phone: string | null) {
  if (!phone) return { prefix: '+51', number: '' }
  const match = PHONE_PREFIXES.find(p => phone.startsWith(p.code))
  if (match) return { prefix: match.code, number: phone.slice(match.code.length).trim() }
  return { prefix: '+51', number: phone }
}

export function EmployeeProfile({ employee: e }: { employee: Employee }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const phoneSplit = splitPhone(e.phone)
  const [form, setForm] = useState({
    full_name: e.full_name,
    email: e.email,
    phone_prefix: phoneSplit.prefix,
    phone_number: phoneSplit.number,
    position: e.position ?? '',
    employee_type: e.employee_type,
    document_type: e.document_type ?? '',
    document_number: e.document_number ?? '',
    birth_date: e.birth_date ?? '',
    address: e.address ?? '',
    notes: e.notes ?? '',
    is_faculty: e.is_faculty ?? false,
  })

  function set(key: string, value: string | boolean) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    await fetch(`/api/hr/employees/${e.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: form.full_name,
        email: form.email,
        phone: form.phone_number ? `${form.phone_prefix} ${form.phone_number}` : null,
        position: form.position || null,
        employee_type: form.employee_type,
        document_type: form.document_type || null,
        document_number: form.document_number || null,
        birth_date: form.birth_date || null,
        address: form.address || null,
        notes: form.notes || null,
        is_faculty: form.is_faculty,
      }),
    })
    setSaving(false)
    setEditing(false)
    router.refresh()
  }

  const isActive = !!e.active_contract_id
  const hasAccess = !!e.user_id

  if (editing) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Editar datos personales</h2>
          <button onClick={() => setEditing(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Nombre completo *</label>
            <input required value={form.full_name} onChange={e => set('full_name', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Correo electrónico *</label>
            <input required type="email" value={form.email} onChange={e => set('email', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Teléfono</label>
            <div className="flex gap-2">
              <select value={form.phone_prefix} onChange={e => set('phone_prefix', e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-28">
                {PHONE_PREFIXES.map(p => <option key={p.code} value={p.code}>{p.flag} {p.code}</option>)}
              </select>
              <input type="tel" value={form.phone_number} onChange={e => set('phone_number', e.target.value)}
                placeholder="999 999 999"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Cargo</label>
            <input value={form.position} onChange={e => set('position', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Tipo de vinculación</label>
            <select value={form.employee_type} onChange={e => set('employee_type', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="direct">Empleado directo</option>
              <option value="contractor">Contratista</option>
              <option value="external">Externo</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Tipo de documento</label>
            <select value={form.document_type} onChange={e => set('document_type', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Seleccionar</option>
              <option value="dni">DNI</option>
              <option value="passport">Pasaporte</option>
              <option value="ce">Carnet de Extranjería</option>
              <option value="other">Otro</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Número de documento</label>
            <input value={form.document_number} onChange={e => set('document_number', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Fecha de nacimiento</label>
            <input type="date" value={form.birth_date} onChange={e => set('birth_date', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Dirección</label>
            <input value={form.address} onChange={e => set('address', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Notas internas</label>
            <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          <div className="col-span-2">
            <label className="flex items-start gap-3 p-4 border-2 rounded-xl cursor-pointer transition-colors border-gray-200 hover:border-indigo-300 has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50">
              <input
                type="checkbox"
                checked={form.is_faculty}
                onChange={ev => set('is_faculty', ev.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">Es docente (Faculty)</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Permite asignar asignaturas por semestre y aparece en la sección Faculty.
                </p>
              </div>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button onClick={() => setEditing(false)}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
            <Save className="w-4 h-4" />
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
      <div className="flex items-start gap-4">
        <Link href="/hr" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 mt-1">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex items-center gap-4 flex-1">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
            {e.full_name.split(' ').map(n => n[0]).slice(0, 2).join('')}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-gray-900">{e.full_name}</h1>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${TYPE_COLOR[e.employee_type]}`}>
                {TYPE_LABEL[e.employee_type]}
              </span>
              {e.is_faculty && (
                <span className="flex items-center gap-1 text-xs text-indigo-700 bg-indigo-50 px-2 py-1 rounded-full font-medium">
                  <GraduationCap className="w-3 h-3" /> Faculty
                </span>
              )}
              {isActive ? (
                <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
                  <CheckCircle2 className="w-3 h-3" /> Contrato activo
                </span>
              ) : e.contract_count === 0 ? (
                <span className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                  <Clock className="w-3 h-3" /> Sin contrato
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-1 rounded-full">
                  <AlertCircle className="w-3 h-3" /> Contrato vencido
                </span>
              )}
              {hasAccess
                ? <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full">Acceso al sistema ✓</span>
                : <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-full">Sin acceso al sistema</span>}
            </div>
            {e.active_position && <p className="text-sm text-gray-500 mt-1">{e.active_position}</p>}
          </div>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors flex-shrink-0"
        >
          <Pencil className="w-3.5 h-3.5" /> Editar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm border-t border-gray-100 pt-4">
        <div className="flex items-center gap-2 text-gray-600">
          <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <a href={`mailto:${e.email}`} className="hover:text-blue-600">{e.email}</a>
        </div>
        {e.phone && (
          <div className="flex items-center gap-2 text-gray-600">
            <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
            {e.phone}
          </div>
        )}
        {e.document_number && (
          <div className="flex items-center gap-2 text-gray-600">
            <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
            {e.document_type ? DOC_LABEL[e.document_type] : 'Doc'}: {e.document_number}
          </div>
        )}
        {e.birth_date && (
          <div className="text-gray-600">
            Nacimiento: {new Date(e.birth_date).toLocaleDateString('es-PE')}
          </div>
        )}
        {e.address && (
          <div className="flex items-center gap-2 text-gray-600 col-span-2">
            <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
            {e.address}
          </div>
        )}
        {e.notes && (
          <div className="col-span-2 text-gray-500 text-xs bg-gray-50 rounded-lg p-3">{e.notes}</div>
        )}
      </div>
    </div>
  )
}
