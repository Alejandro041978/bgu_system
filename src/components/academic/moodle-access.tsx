'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, ShieldOff, ShieldCheck, Search, Clock, AlertTriangle, Plug, Link2, CalendarClock } from 'lucide-react'

interface Row {
  student_id: string; name: string; document: string | null; email: string | null
  overdue: number; has_exception: boolean; exception_id: string | null; exception_expires: string | null
  exception_source: string | null; exception_justification: string | null; no_account: boolean
  currently_suspended: boolean; desired_suspended: boolean; action: 'suspend' | 'unsuspend' | 'none'
}
interface Summary { total: number; a_suspender: number; a_reactivar: number; con_excepcion: number; suspendidos: number; sin_cuenta: number }
interface LinkRow { student_id: string; name: string; email: string | null; status: 'vinculado' | 'candidato' | 'ambiguo' | 'sin_cuenta'; moodle_user_id?: number | null; moodle_email?: string | null; matches?: number }
interface Diag { name_search: boolean; rows: LinkRow[]; summary: { vinculados: number; candidatos: number; ambiguos: number; sin_cuenta: number } }

const money = (n: number) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fdate = (d: string | null) => d ? new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

export function MoodleAccess() {
  const [rows, setRows] = useState<Row[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [configured, setConfigured] = useState(true)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [testing, setTesting] = useState(false)
  const [diagnosing, setDiagnosing] = useState(false)
  const [diag, setDiag] = useState<Diag | null>(null)
  const [linkingId, setLinkingId] = useState<string | null>(null)
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
  const restringidos = filtered.filter(r => !r.has_exception)
  const exceptuados = filtered.filter(r => r.has_exception)

  async function test() {
    setTesting(true); setError(null); setOk(null)
    const d = await fetch('/api/academic/moodle-access', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'test' }),
    }).then(r => r.json())
    setTesting(false)
    if (d.ok) setOk(d.message ?? 'Conexión OK.')
    else setError(d.error ?? 'La prueba falló.')
  }

  async function diagnose() {
    setDiagnosing(true); setError(null); setOk(null); setDiag(null)
    const d = await fetch('/api/academic/moodle-access', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'diagnose' }),
    }).then(r => r.json())
    setDiagnosing(false)
    if (d.error) { setError(d.error); return }
    setDiag(d)
    load() // los "vinculados" ya cachearon su moodle_user_id → Aplicar ya podrá suspenderlos
  }
  async function linkOne(row: LinkRow) {
    if (!row.moodle_user_id) return
    setLinkingId(row.student_id)
    const d = await fetch('/api/academic/moodle-access', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'link', student_id: row.student_id, moodle_user_id: row.moodle_user_id }),
    }).then(r => r.json())
    setLinkingId(null)
    if (d.error) { setError(d.error); return }
    setDiag(prev => prev ? { ...prev, rows: prev.rows.map(r => r.student_id === row.student_id ? { ...r, status: 'vinculado' } : r) } : prev)
  }

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

  async function revoke(r: Row) {
    if (!r.exception_id) return
    if (!confirm(`¿Revocar la excepción de ${r.name}? Si sigue en deuda, volverá a "Restringidos" y podrá suspenderse.`)) return
    setError(null); setOk(null)
    const d = await fetch('/api/academic/moodle-access', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'revoke', id: r.exception_id }),
    }).then(r => r.json())
    if (d.error) { setError(d.error); return }
    setOk(`Excepción de ${r.name} revocada.`); load()
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
          ['Sin cuenta Moodle', summary?.sin_cuenta ?? 0, 'text-gray-400'],
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
        <button onClick={test} disabled={testing || !configured}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
          Probar conexión
        </button>
        <button onClick={diagnose} disabled={diagnosing || !configured}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          title="Localiza en Moodle las cuentas de los estudiantes en deuda que no pudieron suspenderse y las vincula">
          {diagnosing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
          Diagnosticar Moodle
        </button>
        <button onClick={apply} disabled={applying || pending === 0 || !configured}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white">
          {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldOff className="w-4 h-4" />}
          Aplicar cambios{pending > 0 ? ` (${pending})` : ''}
        </button>
      </div>

      {/* Resultado del diagnóstico de vinculación */}
      {diag && (
        <div className="bg-white border border-indigo-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-indigo-50 border-b border-indigo-100 text-sm text-indigo-900">
            <b>Diagnóstico Moodle:</b> {diag.summary.vinculados} vinculado(s) automáticamente,
            {' '}{diag.summary.candidatos} candidato(s) por nombre, {diag.summary.ambiguos} ambiguo(s),
            {' '}{diag.summary.sin_cuenta} sin cuenta localizable.
            {!diag.name_search && <span className="ml-1 text-amber-700">La búsqueda por nombre no está disponible en el token (habilita <span className="font-mono text-xs">core_user_get_users</span> para ampliarla).</span>}
            {diag.summary.vinculados > 0 && <span className="ml-1 text-green-700">Los vinculados ya se pueden suspender con &quot;Aplicar&quot;.</span>}
          </div>
          {diag.rows.some(r => r.status === 'candidato' || r.status === 'ambiguo' || r.status === 'sin_cuenta') && (
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0"><tr className="bg-gray-50 text-gray-500 text-[10.5px] uppercase">
                  <th className="px-4 py-2 text-left">Estudiante</th><th className="px-4 py-2 text-left">Resultado</th><th className="px-4 py-2 text-left">Cuenta Moodle</th><th className="px-4 py-2 text-right"></th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {diag.rows.filter(r => r.status !== 'vinculado').map(r => (
                    <tr key={r.student_id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2"><span className="text-gray-800">{r.name}</span><span className="block text-[11px] text-gray-400">{r.email}</span></td>
                      <td className="px-4 py-2 text-xs">
                        {r.status === 'candidato' && <span className="text-indigo-700">Candidato por nombre</span>}
                        {r.status === 'ambiguo' && <span className="text-amber-700">{r.matches} coincidencias por nombre</span>}
                        {r.status === 'sin_cuenta' && <span className="text-gray-400">Sin cuenta localizable</span>}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600">{r.moodle_email ?? '—'}</td>
                      <td className="px-4 py-2 text-right">
                        {r.status === 'candidato' && (
                          linkingId === r.student_id ? <Loader2 className="w-4 h-4 animate-spin inline text-indigo-500" /> :
                          <button onClick={() => linkOne(r)} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"><Link2 className="w-3 h-3" />Vincular</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* RESTRINGIDOS: en deuda, sin excepción vigente */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-red-50/60 border-b border-red-100 flex items-center gap-2">
          <ShieldOff className="w-4 h-4 text-red-500" />
          <p className="text-sm font-semibold text-gray-800">Restringidos <span className="text-gray-400 font-normal">({restringidos.length})</span></p>
          <p className="text-xs text-gray-500">En deuda vencida y sin excepción. Puedes otorgar una excepción directamente (como asesor).</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-gray-500 text-[10.5px] uppercase">
              <th className="px-4 py-2 text-left">Estudiante</th>
              <th className="px-4 py-2 text-right">Vencido</th>
              <th className="px-4 py-2 text-left">Moodle</th>
              <th className="px-4 py-2 text-left">Acción propuesta</th>
              <th className="px-4 py-2 text-right">Otorgar excepción</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {restringidos.map(r => (
                <tr key={r.student_id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-2"><span className="text-gray-800">{r.name}</span><span className="block text-[11px] text-gray-400 font-mono">{r.document ?? r.email}</span></td>
                  <td className={`px-4 py-2 text-right tabular-nums font-medium ${r.overdue > 0 ? 'text-red-600' : 'text-gray-400'}`}>{money(r.overdue)}</td>
                  <td className="px-4 py-2">
                    {r.no_account
                      ? <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">Sin cuenta</span>
                      : r.currently_suspended
                      ? <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200"><ShieldOff className="w-3 h-3" />Suspendido</span>
                      : <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200"><ShieldCheck className="w-3 h-3" />Activo</span>}
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
              {restringidos.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-gray-400">
                  {rows.length === 0 ? '🎉 Ningún estudiante con deuda vencida ni cuentas suspendidas.' : 'Ninguno restringido con el filtro.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* EXCEPTUADOS: en deuda pero con excepción vigente */}
      <div className="bg-white border border-indigo-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-indigo-50/70 border-b border-indigo-100 flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-indigo-500" />
          <p className="text-sm font-semibold text-gray-800">Exceptuados <span className="text-gray-400 font-normal">({exceptuados.length})</span></p>
          <p className="text-xs text-gray-500">Con gracia vigente. El origen distingue quién la pidió: por un asesor o el propio estudiante (autoservicio).</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-gray-500 text-[10.5px] uppercase">
              <th className="px-4 py-2 text-left">Estudiante</th>
              <th className="px-4 py-2 text-right">Vencido</th>
              <th className="px-4 py-2 text-left">Origen</th>
              <th className="px-4 py-2 text-left">Justificación</th>
              <th className="px-4 py-2 text-left">Compromiso</th>
              <th className="px-4 py-2 text-right"></th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {exceptuados.map(r => (
                <tr key={r.student_id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-2"><span className="text-gray-800">{r.name}</span><span className="block text-[11px] text-gray-400 font-mono">{r.document ?? r.email}</span></td>
                  <td className="px-4 py-2 text-right tabular-nums text-red-600 font-medium">{money(r.overdue)}</td>
                  <td className="px-4 py-2">
                    {r.exception_source === 'estudiante'
                      ? <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Estudiante</span>
                      : <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">Asesor</span>}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-600 max-w-72"><span className="line-clamp-2" title={r.exception_justification ?? ''}>{r.exception_justification ?? '—'}</span></td>
                  <td className="px-4 py-2 text-xs text-indigo-700 whitespace-nowrap"><Clock className="w-3 h-3 inline mr-1" />paga antes del {fdate(r.exception_expires)}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => revoke(r)} className="text-xs font-medium text-red-500 hover:text-red-700">Revocar</button>
                  </td>
                </tr>
              ))}
              {exceptuados.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-gray-400">Ningún estudiante con excepción vigente.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-100">
          Se suspende Moodle a quien tenga <b>vencido</b> ({'>'} $0) sin excepción vigente. Al pagar o al otorgar/pedir excepción, se reactiva. La excepción vence en su fecha de compromiso y, si sigue en deuda, vuelve a Restringidos.
        </p>
      </div>
    </div>
  )
}
