'use client'

import { useState, useRef } from 'react'
import { Search, Eye, LogOut, Loader2 } from 'lucide-react'

interface Hit { id: string; name: string; document_number: string | null; email: string | null }

// Barra para que un superadmin, dentro del portal, busque un estudiante y vea
// el portal "como" ese estudiante (impersonación). Permite cambiar y salir.
export function ImpersonateBar({ impersonating, currentName }: { impersonating: boolean; currentName?: string | null }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [busy, setBusy] = useState(false)
  const deb = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onChange(v: string) {
    setQ(v)
    if (deb.current) clearTimeout(deb.current)
    if (v.trim().length < 2) { setHits([]); return }
    deb.current = setTimeout(async () => {
      const d = await fetch(`/api/students/search?q=${encodeURIComponent(v.trim())}`).then(r => r.json())
      setHits(d.students ?? [])
    }, 300)
  }

  async function enter(h: Hit) {
    if (!h.document_number) { alert('Este estudiante no tiene número de documento'); return }
    setBusy(true)
    await fetch('/api/student/impersonate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ document: h.document_number }),
    })
    window.location.href = '/student'
  }

  async function exit() {
    await fetch('/api/student/impersonate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ document: '' }),
    })
    window.location.href = '/academic/grades'
  }

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex items-center gap-2 text-xs text-amber-800 shrink-0">
          <Eye className="w-3.5 h-3.5" />
          {impersonating ? <span>Viendo como <span className="font-semibold">{currentName}</span></span> : <span className="font-medium">Entrar por (ver como estudiante):</span>}
        </div>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input value={q} onChange={e => onChange(e.target.value)} placeholder="Buscar estudiante por nombre o documento…"
            className="w-full border border-amber-200 rounded-lg pl-8 pr-8 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-400" />
          {busy && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 animate-spin" />}
          {hits.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
              {hits.map(h => (
                <button key={h.id} onClick={() => enter(h)} disabled={busy} className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                  <p className="text-xs text-gray-800">{h.name}</p>
                  <p className="text-[11px] text-gray-400">{h.document_number ?? h.email}</p>
                </button>
              ))}
            </div>
          )}
        </div>
        {impersonating && (
          <button onClick={exit} className="flex items-center gap-1.5 text-xs font-medium text-amber-800 hover:text-amber-900 underline shrink-0">
            <LogOut className="w-3.5 h-3.5" /> Salir de la vista
          </button>
        )}
      </div>
    </div>
  )
}
