'use client'

import { useEffect, useState } from 'react'
import { Eye, LogOut, Loader2, ShieldQuestion, ChevronDown, ChevronRight } from 'lucide-react'

interface Role { id: string; label: string }

// Control de auditoría "ver como rol", ubicado en el pie del sidebar junto a
// "Ver portal estudiantil". Usa /api/staff/impersonate-role (usuario REAL), por
// eso sigue visible —y permite SALIR— aun cuando ya se está viendo como un rol.
export function RoleAudit() {
  const [can, setCan] = useState(false)
  const [roles, setRoles] = useState<Role[]>([])
  const [current, setCurrent] = useState<Role | null>(null)
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/staff/impersonate-role').then(r => r.json()).then(d => {
      setCan(!!d.can_impersonate); setRoles(d.roles ?? []); setCurrent(d.current ?? null)
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

  // Viendo como un rol: mostrar aviso + salir
  if (current) {
    return (
      <div className="rounded-lg bg-indigo-900/30 border border-indigo-800/50 px-3 py-2 space-y-1.5">
        <p className="flex items-center gap-2 text-xs text-indigo-200"><Eye className="w-3.5 h-3.5" /> Auditando: <span className="font-semibold">{current.label}</span></p>
        <button onClick={exit} disabled={busy}
          className="flex items-center gap-2 text-xs font-medium text-indigo-300 hover:text-indigo-100 disabled:opacity-50">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />} Salir de la vista de rol
        </button>
      </div>
    )
  }

  // Selector para entrar
  return (
    <>
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors">
        <ShieldQuestion className="w-4 h-4" />
        Ver como rol
        {open ? <ChevronDown className="w-3.5 h-3.5 ml-auto" /> : <ChevronRight className="w-3.5 h-3.5 ml-auto" />}
      </button>
      {open && (
        <div className="ml-5 py-1 space-y-1.5">
          <select value={sel} onChange={e => setSel(e.target.value)} disabled={busy}
            className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50">
            <option value="">Elegir rol…</option>
            {roles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <button onClick={enter} disabled={busy || !sel}
            className="flex items-center justify-center gap-2 w-full text-xs font-medium bg-indigo-600 text-white rounded-lg px-3 py-1.5 hover:bg-indigo-700 disabled:opacity-40">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />} Entrar
          </button>
        </div>
      )}
    </>
  )
}
