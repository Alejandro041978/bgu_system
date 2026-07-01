'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Upload, ChevronDown, ChevronUp, FileText, X } from 'lucide-react'

export function AddContractForm({ employeeId }: { employeeId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    contract_type: 'fixed_term',
    position: '',
    start_date: '',
    end_date: '',
    salary: '',
    currency: 'PEN',
    notes: '',
  })

  function set(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      let file_url: string | undefined
      if (file) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('employee_id', employeeId)
        const upRes = await fetch('/api/hr/contracts/upload', { method: 'POST', body: fd })
        const upData = await upRes.json() as { url?: string; error?: string }
        if (!upRes.ok) throw new Error(upData.error ?? 'Error al subir archivo')
        file_url = upData.url
      }

      const resp = await fetch('/api/hr/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: employeeId,
          ...form,
          salary: form.salary ? parseFloat(form.salary) : undefined,
          end_date: form.end_date || undefined,
          file_url,
          notes: form.notes || undefined,
        }),
      })
      const data = await resp.json() as { id?: string; error?: string }
      if (!resp.ok) throw new Error(data.error ?? 'Error al guardar')
      setOpen(false)
      setForm({ contract_type: 'fixed_term', position: '', start_date: '', end_date: '', salary: '', currency: 'PEN', notes: '' })
      setFile(null)
      router.refresh()
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Plus className="w-4 h-4 text-blue-600" />
          Agregar contrato
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4 border-t border-gray-100">
          <div className="grid grid-cols-2 gap-4 pt-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tipo de contrato *</label>
              <select
                required
                value={form.contract_type}
                onChange={e => set('contract_type', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="indefinite">Indefinido</option>
                <option value="fixed_term">Plazo fijo</option>
                <option value="services">Locación de servicios</option>
                <option value="internship">Prácticas</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Cargo en el contrato *</label>
              <input
                required
                type="text"
                value={form.position}
                onChange={e => set('position', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ej. Coordinadora Académica"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Fecha de inicio *</label>
              <input
                required
                type="date"
                value={form.start_date}
                onChange={e => set('start_date', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Fecha de término <span className="text-gray-400">(vacío = indefinido)</span>
              </label>
              <input
                type="date"
                value={form.end_date}
                onChange={e => set('end_date', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Remuneración</label>
              <div className="flex gap-2">
                <select
                  value={form.currency}
                  onChange={e => set('currency', e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-20"
                >
                  <option value="PEN">PEN</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.salary}
                  onChange={e => set('salary', e.target.value)}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                <Upload className="w-3 h-3 inline mr-1" />
                Archivo del contrato <span className="text-gray-400">(opcional)</span>
              </label>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.doc,.docx"
                className="hidden"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <div className="flex items-center gap-2 border border-blue-200 bg-blue-50 rounded-lg px-3 py-2">
                  <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <span className="text-sm text-blue-700 truncate flex-1">{file.name}</span>
                  <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = '' }}>
                    <X className="w-3.5 h-3.5 text-blue-400 hover:text-blue-600" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full border border-dashed border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" /> Seleccionar archivo (PDF, Word)
                </button>
              )}
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Notas</label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {saving ? 'Guardando...' : 'Guardar contrato'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
