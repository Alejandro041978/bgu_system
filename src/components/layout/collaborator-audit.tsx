'use client'

import { useEffect, useMemo, useState } from 'react'
import { Eye, LogOut, Loader2, UserSearch, ChevronDown, ChevronRight } from 'lucide-react'

interface Staff { user_id: string; name: string; position: string | null; role: string | null }

// Control de auditoría "ver como colaborador": un superadmin adopta la identidad
// de una persona del staff y ve el ERP tal como ella (permisos, "Mías", tickets…).
// Sesión de solo lectura. Usa /api/staff/impersonate-user (usuario REAL), por eso
// sigue visible y permite SALIR aun dentro de la vista suplantada.
export function CollaboratorAudit() {
  const [can, setCan] = useState(false)
  const [staff, setStaff] = useState<Staff[]>([])
  const [current, setCurrent] = useState<Staff | null>(null)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/staff/impersonate-user').then(r => r.json()).then(d => {
      setCan(!!d.can_impersonate); setStaff(d.staff ?? []); setCurrent(d.current ?? null)
    }).catch(() => null)
  }, [])

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? staff.filter(s => `${s.name} ${s.role ?? ''} ${s.position ?? ''}`.toLowerCase().includes(t)) : staff
  }, [staff, q])

  async function enter(user_id: string) {
    setBusy(true)
    await fetch('/api/staff/impersonate-user', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id }),
    })
    window.location.href = '/desk'
  }
  async function exit() {
    setBusy(true)
    await fetch('/api/staff/impersonate-user', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: '' }),
    })
    window.location.reload()
  }

  if (!can) return null

  if (current) {
    return (
      <div className="rounded-lg bg-indigo-900/30 border border-indigo-800/50 px-3 py-2 space-y-1.5">
        <p className="flex items-center gap-2 text-xs text-indigo-200"><Eye className="w-3.5 h-3.5" /> Auditando a <span className="font-semibold">{current.name}</span></p>
        {current.role && <p className="text-[10.5px] text-indigo-300/80 pl-5.5">{current.role} · solo lectura</p>}
        <button onClick={exit} disabled={busy}
          className="flex items-center gap-2 text-xs font-medium text-indigo-300 hover:text-indigo-100 disabled:opacity-50">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />} Salir de la vista
        </button>
      </div>
    )
  }

  return (
    <>
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors">
        <UserSearch className="w-4 h-4" />
        Ver como colaborador
        {open ? <ChevronDown className="w-3.5 h-3.5 ml-auto" /> : <ChevronRight className="w-3.5 h-3.5 ml-auto" />}
      </button>
      {open && (
        <div className="ml-5 py-1 space-y-1.5">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar colaborador…"
            className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded-lg px-2 py-1.5 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <div className="max-h-56 overflow-y-auto space-y-0.5">
            {filtered.map(s => (
              <button key={s.user_id} onClick={() => enter(s.user_id)} disabled={busy}
                className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-gray-300 hover:bg-gray-800 hover:text-white disabled:opacity-50">
                <span className="block truncate">{s.name}</span>
                {s.role && <span className="block text-[10px] text-gray-500 truncate">{s.role}</span>}
              </button>
            ))}
            {filtered.length === 0 && <p className="px-2 py-2 text-[11px] text-gray-500">Sin coincidencias.</p>}
          </div>
        </div>
      )}
    </>
  )
}
