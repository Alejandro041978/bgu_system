'use client'

import { useState } from 'react'
import { Send, Loader2, X, CheckCircle2 } from 'lucide-react'

type Template = {
  id: string
  name: string
  variables: string[]
  status: string
}

const VARIABLE_LABELS: Record<string, string> = {
  full_name: 'Nombre completo',
  first_name: 'Nombre',
  last_name: 'Apellido',
  email: 'Correo electrónico',
  phone: 'Teléfono',
  document_number: 'Número de documento',
  document_type: 'Tipo de documento',
  birth_date: 'Fecha de nacimiento',
  address: 'Dirección',
  position: 'Cargo',
  start_date: 'Fecha de inicio',
  end_date: 'Fecha de fin',
  salary: 'Salario',
  currency: 'Moneda',
  company_name: 'Nombre de la empresa',
  representative_name: 'Representante',
  nationality: 'Nacionalidad',
  date: 'Fecha',
  place: 'Lugar',
}

function varLabel(v: string) {
  return VARIABLE_LABELS[v] ?? v.replace(/_/g, ' ')
}

export function SendContractForm({ templates }: { templates: Template[] }) {
  const [open, setOpen] = useState(false)
  const [templateId, setTemplateId] = useState('')
  const [signerName, setSignerName] = useState('')
  const [signerEmail, setSignerEmail] = useState('')
  const [signerType, setSignerType] = useState<'employee' | 'teacher' | 'student' | 'other'>('employee')
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ name: string; email: string } | null>(null)

  const activeTemplates = templates.filter(t => t.status === 'active')
  const selectedTemplate = templates.find(t => t.id === templateId)

  function handleTemplateChange(id: string) {
    setTemplateId(id)
    setFieldValues({})
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/contracts/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: templateId,
          signer_name: signerName,
          signer_email: signerEmail,
          signer_type: signerType,
          field_values: fieldValues,
        }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok) throw new Error(data.error)
      setSent({ name: signerName, email: signerEmail })
    } catch (err) {
      setError(String(err))
    } finally {
      setSending(false)
    }
  }

  function reset() {
    setOpen(false)
    setTemplateId('')
    setSignerName('')
    setSignerEmail('')
    setSignerType('employee')
    setFieldValues({})
    setError(null)
    setSent(null)
  }

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
            Se envió el enlace de firma a <strong>{sent.email}</strong>
          </p>
          <button
            onClick={reset}
            className="mt-4 text-sm text-blue-600 hover:underline"
          >
            Enviar otro contrato
          </button>
        </div>
      ) : (
        <form onSubmit={handleSend} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Plantilla *</label>
            <select
              required
              value={templateId}
              onChange={e => handleTemplateChange(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Seleccionar plantilla —</option>
              {activeTemplates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nombre del firmante *</label>
              <input
                required
                value={signerName}
                onChange={e => setSignerName(e.target.value)}
                placeholder="Nombre completo"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Correo del firmante *</label>
              <input
                required
                type="email"
                value={signerEmail}
                onChange={e => setSignerEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Tipo de firmante</label>
            <select
              value={signerType}
              onChange={e => setSignerType(e.target.value as typeof signerType)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="employee">Colaborador</option>
              <option value="teacher">Docente</option>
              <option value="student">Estudiante</option>
              <option value="other">Otro</option>
            </select>
          </div>

          {selectedTemplate && selectedTemplate.variables.length > 0 && (
            <div className="border border-gray-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                Variables del contrato
              </p>
              {selectedTemplate.variables.map(v => (
                <div key={v}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {varLabel(v)} <span className="text-gray-400 font-mono">{`{{${v}}}`}</span>
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
            disabled={sending}
            className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-3 rounded-xl text-sm font-semibold transition-colors"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? 'Enviando...' : 'Enviar enlace de firma por correo'}
          </button>
        </form>
      )}
    </div>
  )
}
