'use client'

import { useState, useEffect } from 'react'
import { Send, Loader2, X, CheckCircle2, UserCheck, ChevronDown } from 'lucide-react'

type Template = {
  id: string
  name: string
  variables: string[]
  status: string
}

type Employee = {
  id: string
  full_name: string
  email: string
  phone?: string | null
  position?: string | null
  document_number?: string | null
  document_type?: string | null
  birth_date?: string | null
  address?: string | null
}

// Mapeo de variables del contrato → campos del empleado
const VAR_TO_EMPLOYEE: Record<string, keyof Employee> = {
  full_name: 'full_name',
  name: 'full_name',
  nombre: 'full_name',
  email: 'email',
  correo: 'email',
  phone: 'phone',
  telefono: 'phone',
  position: 'position',
  cargo: 'position',
  puesto: 'position',
  document_number: 'document_number',
  numero_documento: 'document_number',
  dni: 'document_number',
  document_type: 'document_type',
  tipo_documento: 'document_type',
  birth_date: 'birth_date',
  fecha_nacimiento: 'birth_date',
  address: 'address',
  direccion: 'address',
}

const VAR_LABELS: Record<string, string> = {
  full_name: 'Nombre completo',
  name: 'Nombre',
  email: 'Correo electrónico',
  phone: 'Teléfono',
  position: 'Cargo',
  document_number: 'Número de documento',
  document_type: 'Tipo de documento',
  birth_date: 'Fecha de nacimiento',
  address: 'Dirección',
  nationality: 'Nacionalidad',
  start_date: 'Fecha de inicio',
  end_date: 'Fecha de fin',
  salary: 'Salario',
  currency: 'Moneda',
  company_name: 'Empresa',
  representative_name: 'Representante',
  date: 'Fecha',
  place: 'Lugar',
}

function varLabel(v: string) {
  return VAR_LABELS[v] ?? v.replace(/_/g, ' ')
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return ''
  return iso.split('T')[0]
}

export function SendContractForm({
  templates,
  employees,
}: {
  templates: Template[]
  employees: Employee[]
}) {
  const [open, setOpen] = useState(false)
  const [templateId, setTemplateId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ name: string; email: string } | null>(null)

  const activeTemplates = templates.filter(t => t.status === 'active')
  const selectedTemplate = templates.find(t => t.id === templateId)
  const selectedEmployee = employees.find(e => e.id === employeeId)

  // Auto-rellenar variables cuando cambia el colaborador o la plantilla
  useEffect(() => {
    if (!selectedEmployee || !selectedTemplate) return
    const auto: Record<string, string> = {}
    for (const v of selectedTemplate.variables) {
      const empField = VAR_TO_EMPLOYEE[v.toLowerCase()]
      if (empField) {
        const val = selectedEmployee[empField]
        if (val) auto[v] = empField === 'birth_date' ? formatDate(val as string) : String(val)
      }
    }
    setFieldValues(prev => ({ ...auto, ...Object.fromEntries(Object.entries(prev).filter(([k]) => !auto[k] || prev[k] !== auto[k])) }))
    // reset manual overrides when employee changes
    setFieldValues(auto)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, templateId])

  function handleTemplateChange(id: string) {
    setTemplateId(id)
    setFieldValues({})
  }

  function handleEmployeeChange(id: string) {
    setEmployeeId(id)
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedEmployee) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/contracts/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: templateId,
          signer_name: selectedEmployee.full_name,
          signer_email: selectedEmployee.email,
          signer_type: 'employee',
          signer_ref_id: selectedEmployee.id,
          field_values: fieldValues,
        }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok) throw new Error(data.error)
      setSent({ name: selectedEmployee.full_name, email: selectedEmployee.email })
    } catch (err) {
      setError(String(err))
    } finally {
      setSending(false)
    }
  }

  function reset() {
    setOpen(false)
    setTemplateId('')
    setEmployeeId('')
    setFieldValues({})
    setError(null)
    setSent(null)
  }

  // Variables que ya se auto-rellenaron desde el colaborador
  const autoFilledVars = new Set(
    selectedTemplate?.variables.filter(v => {
      const empField = VAR_TO_EMPLOYEE[v.toLowerCase()]
      return empField && selectedEmployee?.[empField]
    }) ?? []
  )

  // Variables que hay que rellenar manualmente
  const manualVars = selectedTemplate?.variables.filter(v => !autoFilledVars.has(v)) ?? []

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={activeTemplates.length === 0}
        className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
        title={activeTemplates.length === 0 ? 'No hay plantillas activas' : undefined}
      >
        <Send className="w-4 h-4" />
        Enviar contrato a firma
      </button>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-green-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-semibold text-gray-900">Enviar contrato a firma</h2>
        <button onClick={reset} className="p-1 text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      {sent ? (
        <div className="text-center py-6">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-900">¡Contrato enviado!</p>
          <p className="text-sm text-gray-500 mt-1">
            Se envió el enlace de firma a <strong>{sent.name}</strong> ({sent.email})
          </p>
          <button onClick={reset} className="mt-4 text-sm text-blue-600 hover:underline">
            Enviar otro contrato
          </button>
        </div>
      ) : (
        <form onSubmit={handleSend} className="space-y-5">

          {/* Paso 1: Colaborador */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">
              1. Colaborador *
            </label>
            <div className="relative">
              <UserCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <select
                required
                value={employeeId}
                onChange={e => handleEmployeeChange(e.target.value)}
                className="w-full border border-gray-300 rounded-lg pl-9 pr-8 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
              >
                <option value="">— Seleccionar colaborador —</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name} — {emp.position ?? 'Sin cargo'}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            {selectedEmployee && (
              <p className="text-xs text-gray-500 mt-1.5 ml-1">
                Se enviará a: <strong>{selectedEmployee.email}</strong>
              </p>
            )}
          </div>

          {/* Paso 2: Plantilla */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">
              2. Plantilla de contrato *
            </label>
            <div className="relative">
              <select
                required
                value={templateId}
                onChange={e => handleTemplateChange(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 pr-8 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
              >
                <option value="">— Seleccionar plantilla —</option>
                {activeTemplates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Variables auto-rellenadas */}
          {selectedTemplate && selectedEmployee && autoFilledVars.size > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">
                Datos tomados del colaborador
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                {[...autoFilledVars].map(v => (
                  <div key={v} className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                    <span className="text-xs text-gray-600">
                      <span className="text-gray-400 font-mono">{`{{${v}}}`}</span>
                      {' → '}
                      <strong>{fieldValues[v] || '—'}</strong>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Variables manuales */}
          {manualVars.length > 0 && (
            <div className="border border-gray-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                3. Campos adicionales
              </p>
              {manualVars.map(v => (
                <div key={v}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {varLabel(v)}{' '}
                    <span className="text-gray-400 font-mono text-xs">{`{{${v}}}`}</span>
                  </label>
                  <input
                    value={fieldValues[v] ?? ''}
                    onChange={e => setFieldValues(prev => ({ ...prev, [v]: e.target.value }))}
                    placeholder={`Valor para ${varLabel(v)}`}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={sending || !employeeId || !templateId}
            className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-3 rounded-xl text-sm font-semibold transition-colors"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? 'Enviando...' : 'Enviar enlace de firma por correo'}
          </button>
        </form>
      )}
    </div>
  )
}
