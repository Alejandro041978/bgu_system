'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, ShieldOff, ShieldCheck, Search, Clock, AlertTriangle } from 'lucide-react'

interface Row {
  student_id: string; name: string; document: string | null; email: string | null
  overdue: number; has_exception: boolean; exception_expires: string | null
  currently_suspended: boolean; desired_suspended: boolean; action: 'suspend' | 'unsuspend' | 'none'
}
interface Summary { total: number; a_suspender: number; a_reactivar: number; con_excepcion: number; suspendidos: number }

const money = (n: number) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fdate = (d: string | null) => d ? new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

export function MoodleAccess() {
  const [rows, setRows] = useState<Row[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [configured, setConfigured] = useState(true)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [granting, setGranting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [q, setQ] = useState('')

  async function load() {
    setLoading(true); setError(null)
    const d = await fetch('/api/academic/moodle-access').then(r => r.json()).catch(() => ({ error: 'No se pudo cargar' }))
    if (d.error) { setError(d.error); setLoading(false); return }
    setRows(d.rows ?? []); setSummary(d.summary ?? null); setConfigured(!!d.moodle_configured)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? rows.filter(r => `${r.name} ${r.document ?? ''} ${r.email ?? ''}`.toLowerCase().includes(t)) : rows
  }, [rows, q])

  const pending = (summary?.a_suspender ?? 0) + (summary?.a_reactivar ?? 0)

  async function apply() {
    if (!confirm(`¿Aplicar cambios en Moodle? Se suspenderán ${summary?.a_suspender ?? 0} cuenta(s) y se reactivarán ${summary?.a_reactivar ?? 0}.`)) return
    setApplying(true); setError(null); setOk(null)
    const d = await fetch('/api/academic/moodle-access', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'apply' }),
    }).then(r => r.json())
    setApplying(false)
    if (d.error) { setError(d.error); return }
    setOk(`Aplicado: ${d.suspended} suspendida(s), ${d.unsuspended} reactivada(s).${d.errors?.length ? ` ${d.errors.length} con error.` : ''}`)
    if (d.errors?.length) setError(d.errors.join(' · '))
    load()
  }

  async function grant(r: Row, days: number) {
    setGranting(r.student_id); setError(null); setOk(null)
    const d = await fetch('/api/academic/moodle-access', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'grant', student_id: r.student_id, days }),
    }).then(r => r.json())
    setGranting(null)
    if (d.error) { setError(d.error); return }
    setOk(`Excepción de ${days} días otorgada a ${r.name} (hasta ${fdate(d.expires_at)}).`)
    load()
  }

  if (loading) return <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /><p className="text-xs text-gray-400 mt-2">Evaluando deuda vencida…</p></div>

  return (
    <div className="space-y-5">
      {!configured && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> Moodle no está configurado (MOODLE_URL / MOODLE_WS_TOKEN). Puedes ver el plan, pero &quot;Aplicar&quot; no funcionará hasta configurarlo y habilitar <span className="font-mono text-xs">core_user_update_users</span> en el token.
        </div>
      )}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex justify-between"><span className="break-all">{error}</span><button onClick={() => setError(null)}>✕</button></div>}
      {ok && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3 flex justify-between"><span>{ok}</span><button onClick={() => setOk(null)}>✕</button></div>}

      {/* Resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ['En deuda vencida', summary?.total ?? 0, 'text-gray-900'],
          ['A suspender', summary?.a_suspender ?? 0, 'text-red-600'],
          ['A reactivar', summary?.a_reactivar ?? 0, 'text-green-600'],
          ['Con excepción vigente', summary?.con_excepcion ?? 0, 'text-indigo-600'],
        ].map(([l, n, c]) => (
          <div key={l as string} className="bg-white border border-gray-200 rounded-xl p-3.5">
            <p className={`text-2xl font-bold tabular-nums ${c}`}>{n as number}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">{l}</p>
          </div>
        ))}
      </div>

      {/* Barra de acción */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar estudiante…" className="flex-1 text-sm focus:outline-none" />
        </div>
        <button onClick={apply} disabled={applying || pending === 0 || !configured}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white">
          {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldOff className="w-4 h-4" />}
          Aplicar cambios{pending > 0 ? ` (${pending})` : ''}
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-gray-500 text-[10.5px] uppercase">
              <th className="px-4 py-2 text-left">Estudiante</th>
              <th className="px-4 py-2 text-right">Vencido</th>
              <th className="px-4 py-2 text-left">Moodle</th>
              <th className="px-4 py-2 text-left">Excepción</th>
              <th className="px-4 py-2 text-left">Acción propuesta</th>
              <th className="px-4 py-2 text-right">Otorgar excepción</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(r => (
                <tr key={r.student_id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-2">
                    <span className="text-gray-800">{r.name}</span>
                    <span className="block text-[11px] text-gray-400 font-mono">{r.document ?? r.email}</span>
                  </td>
                  <td className={`px-4 py-2 text-right tabular-nums font-medium ${r.overdue > 0 ? 'text-red-600' : 'text-gray-400'}`}>{money(r.overdue)}</td>
                  <td className="px-4 py-2">
                    {r.currently_suspended
                      ? <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200"><ShieldOff className="w-3 h-3" />Suspendido</span>
                      : <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200"><ShieldCheck className="w-3 h-3" />Activo</span>}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {r.has_exception
                      ? <span className="inline-flex items-center gap-1 text-indigo-700"><Clock className="w-3 h-3" />hasta {fdate(r.exception_expires)}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {r.action === 'suspend' && <span className="text-red-600 font-medium">Suspender</span>}
                    {r.action === 'unsuspend' && <span className="text-green-600 font-medium">Reactivar</span>}
                    {r.action === 'none' && <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {granting === r.student_id ? <Loader2 className="w-4 h-4 animate-spin inline text-indigo-500" /> : (
                      <>
                        <button onClick={() => grant(r, 3)} className="text-xs font-medium text-indigo-600 hover:text-indigo-800 px-1.5">3 días</button>
                        <button onClick={() => grant(r, 5)} className="text-xs font-medium text-indigo-600 hover:text-indigo-800 px-1.5">5 días</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-xs text-gray-400">
                  {rows.length === 0 ? '🎉 Ningún estudiante con deuda vencida ni cuentas suspendidas.' : 'Sin coincidencias con el filtro.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-100">
          Se suspende la cuenta Moodle de quien tenga <b>vencido</b> ({'>'} $0) y no tenga excepción vigente. Al pagar (queda sin vencido) o al otorgar excepción, se reactiva. &quot;Aplicar cambios&quot; ejecuta las suspensiones/reactivaciones pendientes en Moodle.
        </p>
      </div>
    </div>
  )
}
