'use client'

import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2, Copy } from 'lucide-react'
import { UpgradeSimulatorCore } from '@/components/admissions/upgrade-simulator-core'
import { usePermissions } from '@/hooks/use-permissions'

// ---------------------------------------------------------------------------
// Cara INTERNA del simulador Upgrade: simular, mantener el catálogo de
// carreras (donde vive la regla), atender interesados y copiar el snippet
// para incrustar la versión pública en la web.
// ---------------------------------------------------------------------------
interface Carrera {
  carrera_key: string; nombre: string; familia: string
  califica_admin: boolean; califica_conta: boolean; revisado: boolean; nota: string | null; n_programas: number
}
interface Lead {
  id: string; created_at: string; origen: string; nombre: string | null; whatsapp: string | null; email: string | null
  instituto_nombre: string | null; carrera_key: string | null; carrera_texto: string | null
  veredicto: { tipo: string; titulo: string } | null; atendido_at: string | null; atendido_by: string | null
}

const FAMILIAS: [string, string][] = [
  ['contabilidad', 'Contabilidad'], ['administracion', 'Administración'], ['afin', 'Afín a Administración'],
  ['no_afin', 'No afín'], ['sin_clasificar', 'Sin clasificar'],
]
const FAM_CLS: Record<string, string> = {
  contabilidad: 'bg-purple-50 text-purple-700', administracion: 'bg-blue-50 text-blue-700',
  afin: 'bg-sky-50 text-sky-700', no_afin: 'bg-gray-100 text-gray-500', sin_clasificar: 'bg-amber-50 text-amber-700',
}
const fdate = (d: string | null) => d ? new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
const API = '/api/admissions/upgrade-simulator'

export function UpgradeSimulatorAdmin() {
  const { canEdit } = usePermissions()
  const puedeEditar = canEdit('admissions_upgrade_simulator')
  const [tab, setTab] = useState<'simulador' | 'carreras' | 'interesados' | 'incrustar'>('simulador')
  const [carreras, setCarreras] = useState<Carrera[] | null>(null)
  const [resumen, setResumen] = useState<{ institutos: number; licenciados: number } | null>(null)
  const [filtro, setFiltro] = useState<'todas' | 'por_revisar' | 'califican'>('todas')
  const [busca, setBusca] = useState('')
  const [leads, setLeads] = useState<Lead[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  const cargarCarreras = () => fetch(`${API}?view=careers`).then(r => r.json()).then(d => { setCarreras(d.carreras ?? []); setResumen({ institutos: d.institutos, licenciados: d.licenciados }) })
  const cargarLeads = () => fetch(`${API}?view=leads`).then(r => r.json()).then(d => setLeads(d.leads ?? []))
  useEffect(() => { if (tab === 'carreras' && !carreras) cargarCarreras(); if (tab === 'interesados' && !leads) cargarLeads() }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  async function patch(body: object, key: string) {
    setBusy(key)
    const r = await fetch(API, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setBusy(null)
    if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error ?? 'No se pudo guardar'); return }
    if ('carrera_key' in body) cargarCarreras(); else cargarLeads()
  }

  const origenPublico = typeof window !== 'undefined' ? window.location.origin : 'https://system.blackwell.university'
  const snippet = `<iframe src="${origenPublico}/form/upgrade-simulator" width="100%" height="900" style="border:0;max-width:720px" title="Simulador Upgrade Blackwell"></iframe>`

  const lista = (carreras ?? []).filter(c => {
    if (filtro === 'por_revisar' && c.revisado) return false
    if (filtro === 'califican' && !(c.califica_admin || c.califica_conta)) return false
    if (busca && !c.nombre.toLowerCase().includes(busca.toLowerCase())) return false
    return true
  })

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-gray-200">
        {([['simulador', 'Simulador'], ['carreras', 'Catálogo de carreras'], ['interesados', 'Interesados'], ['incrustar', 'Incrustar en la web']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab === k ? 'border-blue-600 text-blue-700 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{l}</button>
        ))}
      </div>

      {tab === 'simulador' && (
        <div className="max-w-2xl">
          <p className="text-xs text-gray-500 bg-blue-50 rounded-lg px-4 py-3 mb-4">
            Mismo motor que la versión pública. Regla: solo institutos licenciados por MINEDU; Contabilidad recibe solo Contabilidad;
            Administración recibe Administración, afines y también Contabilidad. La regla por carrera se ajusta en la pestaña Catálogo.
          </p>
          <UpgradeSimulatorCore apiBase={API} captura={false} />
        </div>
      )}

      {tab === 'carreras' && (
        <div className="space-y-3">
          {resumen && (
            <p className="text-xs text-gray-500">{resumen.licenciados} institutos licenciados de {resumen.institutos} en la base · {(carreras ?? []).length} carreras distintas ·{' '}
              <b className="text-amber-700">{(carreras ?? []).filter(c => !c.revisado).length} por revisar</b> (clasificación automática pendiente de confirmar)</p>
          )}
          <div className="flex flex-wrap gap-2">
            <select value={filtro} onChange={e => setFiltro(e.target.value as typeof filtro)} className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white">
              <option value="todas">Todas</option><option value="por_revisar">Por revisar</option><option value="califican">Califican</option>
            </select>
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar carrera…" className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[200px]" />
          </div>
          {!carreras ? <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin text-blue-500 mx-auto" /></div> : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
                  <tr>
                    <th className="text-left px-3 py-2">Carrera</th><th className="text-center px-2 py-2">Institutos</th>
                    <th className="text-left px-2 py-2">Familia</th><th className="text-center px-2 py-2">Admin.</th><th className="text-center px-2 py-2">Conta.</th>
                    <th className="text-left px-2 py-2">Nota / revisión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {lista.map(c => (
                    <tr key={c.carrera_key} className={!c.revisado ? 'bg-amber-50/40' : ''}>
                      <td className="px-3 py-1.5 text-gray-800">{c.nombre}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums text-gray-500">{c.n_programas}</td>
                      <td className="px-2 py-1.5">
                        {puedeEditar ? (
                          <select value={c.familia} disabled={busy === c.carrera_key}
                            onChange={e => patch({ carrera_key: c.carrera_key, familia: e.target.value }, c.carrera_key)}
                            className={`text-xs rounded px-1.5 py-1 border-0 ${FAM_CLS[c.familia] ?? ''}`}>
                            {FAMILIAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        ) : <span className={`text-xs rounded-full px-2 py-0.5 ${FAM_CLS[c.familia] ?? ''}`}>{FAMILIAS.find(f => f[0] === c.familia)?.[1] ?? c.familia}</span>}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <input type="checkbox" checked={c.califica_admin} disabled={!puedeEditar || busy === c.carrera_key}
                          onChange={e => patch({ carrera_key: c.carrera_key, califica_admin: e.target.checked }, c.carrera_key)} className="w-4 h-4" />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <input type="checkbox" checked={c.califica_conta} disabled={!puedeEditar || busy === c.carrera_key}
                          onChange={e => patch({ carrera_key: c.carrera_key, califica_conta: e.target.checked }, c.carrera_key)} className="w-4 h-4" />
                      </td>
                      <td className="px-2 py-1.5 text-xs text-gray-500">
                        {c.nota ?? ''}
                        {!c.revisado && puedeEditar && (
                          <button onClick={() => patch({ carrera_key: c.carrera_key, revisado: true }, c.carrera_key)} className="ml-2 text-amber-700 underline">confirmar</button>
                        )}
                        {c.revisado && <CheckCircle2 className="inline w-3.5 h-3.5 text-green-500 ml-1" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'interesados' && (
        !leads ? <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin text-blue-500 mx-auto" /></div> : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
                <tr><th className="text-left px-3 py-2">Fecha</th><th className="text-left px-3 py-2">Interesado</th><th className="text-left px-3 py-2">Instituto · carrera</th><th className="text-left px-3 py-2">Resultado</th><th className="px-3 py-2" /></tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {leads.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-400">Sin simulaciones todavía.</td></tr>}
                {leads.map(l => (
                  <tr key={l.id} className={l.nombre || l.whatsapp ? '' : 'text-gray-400'}>
                    <td className="px-3 py-1.5 text-xs whitespace-nowrap">{fdate(l.created_at)} <span className="text-gray-300">· {l.origen}</span></td>
                    <td className="px-3 py-1.5 text-xs">{l.nombre ?? <span className="text-gray-300">anónimo</span>}{l.whatsapp && <span className="block text-gray-500">{l.whatsapp}</span>}{l.email && <span className="block text-gray-400">{l.email}</span>}</td>
                    <td className="px-3 py-1.5 text-xs">{l.instituto_nombre ?? '—'}<span className="block text-gray-400">{l.carrera_key ?? l.carrera_texto ?? ''}</span></td>
                    <td className="px-3 py-1.5 text-xs">
                      <span className={`rounded-full px-2 py-0.5 ${l.veredicto?.tipo === 'califica' ? 'bg-green-50 text-green-700' : l.veredicto?.tipo === 'evaluacion' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{l.veredicto?.titulo ?? '—'}</span>
                    </td>
                    <td className="px-3 py-1.5 text-xs text-right whitespace-nowrap">
                      {(l.nombre || l.whatsapp) && (l.atendido_at
                        ? <span className="text-green-700">atendido {fdate(l.atendido_at)}</span>
                        : puedeEditar && <button onClick={() => patch({ lead_id: l.id, atendido: true }, l.id)} className="text-blue-600 underline">marcar atendido</button>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'incrustar' && (
        <div className="max-w-2xl space-y-3">
          <p className="text-sm text-gray-600">Pega este código en la página de la web donde quieras mostrar el simulador. Es público, no requiere sesión y solo muestra nombre y ubicación de los institutos.</p>
          <pre className="bg-gray-900 text-green-200 text-xs rounded-lg p-4 overflow-x-auto whitespace-pre-wrap break-all">{snippet}</pre>
          <button onClick={() => { navigator.clipboard.writeText(snippet).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000) }) }}
            className="inline-flex items-center gap-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">
            <Copy className="w-4 h-4" />{copiado ? 'Copiado' : 'Copiar código'}
          </button>
          <p className="text-xs text-gray-400">Vista previa directa: <a href="/form/upgrade-simulator" target="_blank" rel="noreferrer" className="text-blue-600 underline">{origenPublico}/form/upgrade-simulator</a></p>
        </div>
      )}
    </div>
  )
}
