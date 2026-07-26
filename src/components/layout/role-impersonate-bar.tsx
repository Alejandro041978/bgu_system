'use client'

import { useEffect, useState } from 'react'
import { Eye, LogOut, Loader2, ShieldQuestion } from 'lucide-react'

interface Role { id: string; label: string }

// Barra para que un superadmin "vea como" un rol de colaborador y audite qué
// pantallas y permisos tiene ese rol. Solo se muestra a superadmins reales.
export function RoleImpersonateBar() {
  const [can, setCan] = useState(false)
  const [roles, setRoles] = useState<Role[]>([])
  const [current, setCurrent] = useState<Role | null>(null)
  const [sel, setSel] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/staff/impersonate-role').then(r => r.json()).then(d => {
      setCan(!!d.can_impersonate)
      setRoles(d.roles ?? [])
      setCurrent(d.current ?? null)
    }).catch(() => null)
  }, [])

  async function enter() {
    if (!sel) return
    setBusy(true)
    await fetch('/api/staff/impersonate-role', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role_id: sel }),
    })
    window.location.href = '/desk'
  }
  async function exit() {
    setBusy(true)
    await fetch('/api/staff/impersonate-role', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role_id: '' }),
    })
    window.location.reload()
  }

  if (!can) return null

  return (
    <div className={`border-b px-4 py-2 ${current ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-200'}`}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex items-center gap-2 text-xs shrink-0">
          {current
            ? <><Eye className="w-3.5 h-3.5 text-indigo-700" /><span className="text-indigo-800">Auditando como rol <span className="font-semibold">{current.label}</span></span></>
            : <><ShieldQuestion className="w-3.5 h-3.5 text-slate-500" /><span className="font-medium text-slate-600">Auditar vista de un rol (ver como):</span></>}
        </div>
        {!current && (
          <div className="flex items-center gap-2">
            <select value={sel} onChange={e => setSel(e.target.value)} disabled={busy}
              className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50">
              <option value="">Elegir rol…</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <button onClick={enter} disabled={busy || !sel}
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg px-3 py-1.5 hover:bg-indigo-700 disabled:opacity-40">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}Ver como rol
            </button>
          </div>
        )}
        {current && (
          <button onClick={exit} disabled={busy} className="flex items-center gap-1.5 text-xs font-medium text-indigo-800 hover:text-indigo-900 underline shrink-0 disabled:opacity-50">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />} Salir de la vista de rol
          </button>
        )}
      </div>
    </div>
  )
}
