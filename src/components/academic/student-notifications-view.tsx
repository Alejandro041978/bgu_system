'use client'

import { useState } from 'react'
import { Search, Loader2, Mail, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'

// ---------------------------------------------------------------------------
// Notificaciones — la bitácora de correos del ERP al estudiante (08/09/2026).
// Buscar estudiante → línea de tiempo: tipo, asunto, destinatarios, estado
// (enviada/fallida con motivo), y el cuerpo exacto que le llegó. Las fallidas
// se pueden reenviar (queda como fila nueva; la fallida es historia).
// ---------------------------------------------------------------------------
interface StudentHit { id: string; name: string; document_number: string | null; email: string | null }
interface Notif {
  id: string; kind: string; subject: string; body_html: string
  to_emails: string[]; status: 'enviada' | 'fallida'; error: string | null
  sent_at: string; triggered_by: string | null
}

const KIND: Record<string, { label: string; cls: string }> = {
  loa_aplicado: { label: 'LOA', cls: 'bg-orange-50 text-orange-700' },
  iw_aplicado: { label: 'IW', cls: 'bg-rose-50 text-rose-700' },
  reentry_aplicado: { label: 'Re-Entry', cls: 'bg-emerald-50 text-emerald-700' },
  reversion_aplicada: { label: 'Reversión', cls: 'bg-violet-50 text-violet-700' },
}

export function StudentNotificationsView() {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<StudentHit[]>([])
  const [student, setStudent] = useState<StudentHit | null>(null)
  const [items, setItems] = useState<Notif[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function buscar() {
    if (!q.trim()) return
    const d = await fetch(`/api/students/search?q=${encodeURIComponent(q.trim())}`).then(r => r.json()).catch(() => ({}))
    setHits(d.students ?? [])
  }
  async function abrir(h: StudentHit) {
    setStudent(h); setHits([]); setItems(null); setError(null)
    const d = await fetch(`/api/academic/student-notifications?student_id=${h.id}`).then(r => r.json()).catch(() => ({ error: 'Error de red' }))
    if (d.error) { setError(d.error); return }
    setItems(d.notificaciones ?? [])
  }
  async function reenviar(n: Notif) {
    if (!student || !confirm(`¿Reenviar "${n.subject}"?`)) return
    setBusy(n.id); setError(null)
    const d = await fetch('/api/academic/student-notifications', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resend_id: n.id }),
    }).then(r => r.json()).catch(() => ({ error: 'Error de red' }))
    setBusy(null)
    if (d.error) { setError(d.error); return }
    abrir(student)
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscar()}
            placeholder="Buscar estudiante por nombre, documento o correo…"
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>
        <button onClick={buscar} disabled={!q.trim()}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-xl disabled:opacity-40">Buscar</button>
      </div>

      {hits.length > 0 && !student && (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-50">
          {hits.map(h => (
            <button key={h.id} onClick={() => abrir(h)} className="w-full text-left px-4 py-2.5 hover:bg-gray-50">
              <p className="text-sm text-gray-800">{h.name}</p>
              <p className="text-[11px] text-gray-400">{h.document_number ?? '—'}{h.email ? ` · ${h.email}` : ''}</p>
            </button>
          ))}
        </div>
      )}

      {student && (
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-900">{student.name}</p>
            <p className="text-[11px] text-gray-400">{student.document_number ?? '—'}</p>
          </div>
          <button onClick={() => { setStudent(null); setItems(null); setQ(''); setHits([]) }}
            className="ml-auto text-sm text-gray-500 hover:text-gray-800">Buscar otro</button>
        </div>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>}
      {student && !items && !error && <p className="text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin inline mr-1" />Cargando…</p>}

      {items && items.length === 0 && (
        <p className="text-sm text-gray-400 py-8 text-center">
          Sin notificaciones registradas. La bitácora existe desde el 08/09/2026 — lo enviado antes no se registraba.
        </p>
      )}

      {items && items.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-50">
          {items.map(n => (
            <div key={n.id}>
              <button onClick={() => setOpen(open === n.id ? null : n.id)} className="w-full text-left px-4 py-2.5 hover:bg-gray-50">
                <div className="flex items-center gap-2 flex-wrap">
                  {open === n.id ? <ChevronDown className="w-3.5 h-3.5 text-gray-300" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-300" />}
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${KIND[n.kind]?.cls ?? 'bg-gray-100 text-gray-600'}`}>
                    {KIND[n.kind]?.label ?? n.kind}
                  </span>
                  <span className="text-sm text-gray-800">{n.subject}</span>
                  <span className={`ml-auto text-[11px] font-medium ${n.status === 'enviada' ? 'text-green-700' : 'text-red-600'}`}>
                    {n.status === 'enviada' ? 'enviada' : `fallida${n.error ? `: ${n.error}` : ''}`}
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5 pl-6">
                  {new Date(n.sent_at).toLocaleString('es-PE')} · a {n.to_emails.join(', ') || 'sin destinatarios'}
                  {n.triggered_by ? ` · por ${n.triggered_by}` : ''}
                </p>
              </button>
              {open === n.id && (
                <div className="px-6 pb-4 space-y-2">
                  <button onClick={() => reenviar(n)} disabled={busy === n.id}
                    className="inline-flex items-center gap-1.5 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                    {busy === n.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Reenviar
                  </button>
                  <div className="border border-gray-100 rounded-lg overflow-hidden">
                    <iframe srcDoc={n.body_html} sandbox="" title={n.subject} className="w-full h-96 bg-white" />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!student && hits.length === 0 && (
        <p className="text-sm text-gray-400 py-10 text-center flex items-center justify-center gap-2">
          <Mail className="w-4 h-4" /> Busca un estudiante para ver todo lo que el ERP le ha notificado.
        </p>
      )}
    </div>
  )
}
