'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Save, Send, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

const PHONE_PREFIXES = [
  { code: '+51', flag: '🇵🇪', label: 'Perú' },
  { code: '+57', flag: '🇨🇴', label: 'Colombia' },
  { code: '+56', flag: '🇨🇱', label: 'Chile' },
  { code: '+54', flag: '🇦🇷', label: 'Argentina' },
  { code: '+52', flag: '🇲🇽', label: 'México' },
  { code: '+58', flag: '🇻🇪', label: 'Venezuela' },
  { code: '+593', flag: '🇪🇨', label: 'Ecuador' },
  { code: '+591', flag: '🇧🇴', label: 'Bolivia' },
  { code: '+595', flag: '🇵🇾', label: 'Paraguay' },
  { code: '+598', flag: '🇺🇾', label: 'Uruguay' },
  { code: '+1', flag: '🇺🇸', label: 'EE.UU.' },
  { code: '+34', flag: '🇪🇸', label: 'España' },
]

const ZOHO_AGENTS = [
  { id: '1095985000000339097', name: 'Adriana Masias', email: 'adriana.masias@blackwell.university' },
  { id: '1095985000000139001', name: 'Alejandro Nunez Vizcarra', email: 'alejandro.nunez@blackwell.university' },
  { id: '1095985000000307659', name: 'Claudia Quispe Llanos', email: 'claudia.quispe@blackwell.university' },
  { id: '1095985000000339061', name: 'Fari Carrillo', email: 'faridee.carrillo@neumann.education' },
  { id: '1095985000013262447', name: 'Patricia Najar Villanueva', email: 'patricia.najar@neumann.education' },
  { id: '1095985000000307623', name: 'Sara Morales Flores', email: 'sara.morales@blackwell.university' },
]

export function NewEmployeeForm() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    first_names: '',
    last_names: '',
    email: '',
    phone: '',
    position: '',
    employee_type: 'direct' as 'direct' | 'contractor' | 'external',
    document_type: '' as 'dni' | 'passport' | 'ce' | 'other' | '',
    document_number: '',
    birth_date: '',
    address: '',
    notes: '',
    send_invite: true,
    is_faculty: false,
    is_helpdesk: false,
    zoho_agent_id: '',
    zoho_agent_email: '',
    phone_prefix: '+51',
    phone_number: '',
    nacionalidad: '',
  })

  function set(key: string, value: string | boolean | null) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const resp = await fetch('/api/hr/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
        ...form,
        full_name: `${form.first_names} ${form.last_names}`.replace(/\s+/g, ' ').trim(),
        phone: form.phone_number ? `${form.phone_prefix} ${form.phone_number}` : '',
      }),
      })
      const data = await resp.json() as { id?: string; error?: string }
      if (!resp.ok) throw new Error(data.error ?? 'Error al guardar')
      router.push(`/hr/${data.id}`)
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Link href="/hr" className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" /> Volver a colaboradores
      </Link>

      {/* Datos personales */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Datos personales</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nombres *</label>
            <input
              required
              type="text"
              value={form.first_names}
              onChange={e => set('first_names', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ej. María"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Apellidos *</label>
            <input
              required
              type="text"
              value={form.last_names}
              onChange={e => set('last_names', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ej. García López"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Correo electrónico *</label>
            <input
              required
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="nombre@blackwell.university"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Teléfono</label>
            <div className="flex gap-2">
              <select
                value={form.phone_prefix}
                onChange={e => set('phone_prefix', e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-28"
              >
                {PHONE_PREFIXES.map(p => (
                  <option key={p.code} value={p.code}>
                    {p.flag} {p.code}
                  </option>
                ))}
              </select>
              <input
                type="tel"
                value={form.phone_number}
                onChange={e => set('phone_number', e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="999 999 999"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Tipo de documento</label>
            <select
              value={form.document_type}
              onChange={e => set('document_type', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Seleccionar</option>
              <option value="dni">DNI</option>
              <option value="passport">Pasaporte</option>
              <option value="ce">Carnet de Extranjería</option>
              <option value="other">Otro</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Número de documento</label>
            <input
              type="text"
              value={form.document_number}
              onChange={e => set('document_number', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Fecha de nacimiento</label>
            <input
              type="date"
              value={form.birth_date}
              onChange={e => set('birth_date', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nacionalidad</label>
            <input
              type="text"
              value={form.nacionalidad}
              onChange={e => set('nacionalidad', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ej. Peruana, Colombiana"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Cargo</label>
            <input
              type="text"
              value={form.position}
              onChange={e => set('position', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ej. Coordinadora Académica"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Dirección</label>
            <input
              type="text"
              value={form.address}
              onChange={e => set('address', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Notas internas</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="col-span-2">
            <label className="flex items-start gap-3 p-4 border-2 rounded-xl cursor-pointer transition-colors border-gray-200 hover:border-indigo-300 has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50">
              <input
                type="checkbox"
                checked={form.is_faculty}
                onChange={e => set('is_faculty', e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">Es docente (Faculty)</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Permite asignar asignaturas por semestre y aparece en la sección Faculty para gestión académica.
                </p>
              </div>
            </label>
          </div>

          <div className="col-span-2">
            <label className="flex items-start gap-3 p-4 border-2 rounded-xl cursor-pointer transition-colors border-gray-200 hover:border-blue-300 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
              <input
                type="checkbox"
                checked={form.is_helpdesk}
                onChange={e => set('is_helpdesk', e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">Equipo Helpdesk</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Atiende el buzón de WhatsApp y correo. Podrás asignarle skills (idiomas, categorías, temas) en Helpdesk · Skills.
                </p>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* Tipo de vinculación */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Tipo de vinculación *</h2>
        <div className="grid grid-cols-3 gap-3">
          {([
            { value: 'direct', label: 'Empleado directo', desc: 'Planilla propia' },
            { value: 'contractor', label: 'Contratista', desc: 'Honorarios / RxH' },
            { value: 'external', label: 'Externo', desc: 'Empresa tercera' },
          ] as const).map(opt => (
            <label
              key={opt.value}
              className={`flex flex-col gap-1 p-4 border-2 rounded-xl cursor-pointer transition-colors ${
                form.employee_type === opt.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="employee_type"
                value={opt.value}
                checked={form.employee_type === opt.value}
                onChange={() => set('employee_type', opt.value)}
                className="sr-only"
              />
              <span className="text-sm font-medium text-gray-900">{opt.label}</span>
              <span className="text-xs text-gray-500">{opt.desc}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Vinculación con Zoho Desk */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Agente en Zoho Desk</h2>
          <p className="text-xs text-gray-500 mt-0.5">Vincula este colaborador con su cuenta de agente para calcular KPIs automáticamente.</p>
        </div>
        <select
          value={form.zoho_agent_id}
          onChange={e => {
            const opt = ZOHO_AGENTS.find(a => a.id === e.target.value)
            set('zoho_agent_id', e.target.value)
            set('zoho_agent_email', opt?.email ?? '')
          }}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">Sin vinculación (no es agente de Zoho Desk)</option>
          {ZOHO_AGENTS.map(a => (
            <option key={a.id} value={a.id}>{a.name} — {a.email}</option>
          ))}
        </select>
      </div>

      {/* Acceso al sistema */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.send_invite}
            onChange={e => set('send_invite', e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <div>
            <p className="text-sm font-medium text-gray-900">Enviar enlace de acceso por correo</p>
            <p className="text-xs text-gray-500 mt-0.5">
              El colaborador recibirá un correo con un enlace mágico para ingresar al sistema sin contraseña.
              Cada vez que necesite acceder, puede solicitar un nuevo enlace desde la pantalla de login.
            </p>
          </div>
        </label>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>
      )}

      <div className="flex justify-end gap-3">
        <Link href="/hr" className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {form.send_invite ? <Send className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saving ? 'Guardando...' : form.send_invite ? 'Guardar y enviar acceso' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}
