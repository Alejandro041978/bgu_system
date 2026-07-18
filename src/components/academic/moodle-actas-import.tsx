'use client'

import { useEffect, useState } from 'react'
import { Loader2, Search, Download, CheckCircle2, AlertTriangle } from 'lucide-react'

interface Candidate { id: string; code: string | null; name: string; program: string }
interface Aula {
  id: number; shortname: string; fullname: string; visible?: number
  linked: { course: Candidate; group: string | null } | null
}
interface MatchedRow { document: string; name: string; total: number | null; destino: string }
interface Preview {
  courseid: number; alumnos_en_reporte: number; matched_total: number
  con_nota: number; sin_nota: number
  ya_importadas: number; cerradas: number
  ya_registradas_activa: number; rellenan_pendiente: number; nuevas: number
  unmatched: { fullname: string; idnumber: string }[]
  matched: MatchedRow[]
}
interface ImportResult {
  inserted: number; updated: number; unchanged: number; protected_rows: number; locked_rows: number
  sin_puente: number; sin_total: number; importables: number
  ya_registradas_activa: number; rellenadas_pendientes: number
  detalles_escritos: number
  errors: string[]
  recompute: { egresados_detectados?: number; situaciones_actualizadas?: number; avances_de_carrusel?: number; error?: string } | null
}

export function MoodleActasImport() {
  const [aulas, setAulas] = useState<Aula[]>([])
  const [loadingAulas, setLoadingAulas] = useState(true)
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<Aula | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  const [termYear, setTermYear] = useState(String(new Date().getFullYear()))
  const [termBlock, setTermBlock] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/academic/moodle-actas').then(r => r.json()).then(d => {
      setAulas(d.aulas ?? []); setLoadingAulas(false)
      if (d.error) setError(d.error)
    })
  }, [])

  async function selectAula(a: Aula) {
    setSelected(a); setPreview(null); setResult(null); setError(null)
    setLoadingPreview(true)
    const d = await fetch(`/api/academic/moodle-actas?courseid=${a.id}`).then(r => r.json())
    setLoadingPreview(false)
    if (d.error) { setError(d.error); return }
    setPreview(d)
  }

  async function setLock(action: 'lock' | 'unlock') {
    if (!selected) return
    const msg = action === 'lock'
      ? `Se cerrará el acta del aula "${selected.shortname}": ninguna importación podrá tocar esas notas (el editor manual sí). ¿Continuar?`
      : `Se REABRIRÁ el acta del aula "${selected.shortname}": las importaciones podrán volver a actualizar esas notas. ¿Continuar?`
    if (!confirm(msg)) return
    const r = await fetch('/api/academic/moodle-actas', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseid: selected.id, action }),
    })
    const d = await r.json()
    if (!r.ok) { setError(d.error ?? 'Error'); return }
    selectAula(selected)  // refrescar estado
  }

  async function doImport() {
    if (!selected?.linked || !termYear || !termBlock.trim()) return
    const c = selected.linked.course
    if (!confirm(`Se importará el acta del aula "${selected.shortname}" hacia ${c.code ?? ''} ${c.name} (${termYear} · ${termBlock}). ¿Continuar?`)) return
    setImporting(true); setError(null); setResult(null)
    const r = await fetch('/api/academic/moodle-actas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseid: selected.id, term_year: Number(termYear), term_block: termBlock.trim() }),
    })
    const d = await r.json()
    setImporting(false)
    if (!r.ok) { setError(d.error ?? 'Error'); return }
    setResult(d)
  }

  const visibleAulas = aulas.filter(a =>
    !filter.trim() || `${a.shortname} ${a.fullname}`.toLowerCase().includes(filter.toLowerCase()))

  return (
    <div className="space-y-4">
      {/* Selector de aula */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">1 · Aula Moodle</h3>
        {loadingAulas ? (
          <div className="py-6 text-center"><Loader2 className="w-5 h-5 animate-spin text-blue-500 mx-auto" /></div>
        ) : (
          <>
            <div className="flex items-center border border-gray-200 rounded-lg px-3 max-w-md">
              <Search className="w-4 h-4 text-gray-400" />
              <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filtrar aulas…" className="flex-1 px-2 py-2 text-sm focus:outline-none" />
            </div>
            <div className="max-h-64 overflow-auto divide-y divide-gray-50 border border-gray-100 rounded-lg">
              {visibleAulas.map(a => (
                <button key={a.id} onClick={() => selectAula(a)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50/50 ${selected?.id === a.id ? 'bg-blue-50' : ''}`}>
                  <span className="font-medium text-gray-800">{a.shortname}</span>
                  <span className="text-xs text-gray-400 ml-2">#{a.id}{a.visible === 0 ? ' · oculta' : ''}</span>
                  {a.linked && (
                    <span className="text-[10px] font-medium bg-green-50 text-green-700 px-1.5 py-0.5 rounded-full ml-2">
                      vinculada{a.linked.group ? `: ${a.linked.group}` : ''}
                    </span>
                  )}
                </button>
              ))}
              {visibleAulas.length === 0 && <p className="text-xs text-gray-400 px-3 py-4">Sin aulas que coincidan.</p>}
            </div>
          </>
        )}
      </div>

      {/* Vista previa */}
      {selected && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">2 · Vista previa — {selected.shortname}</h3>
          {loadingPreview ? (
            <div className="py-6 text-center"><Loader2 className="w-5 h-5 animate-spin text-blue-500 mx-auto" /></div>
          ) : preview && (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded-full">{preview.alumnos_en_reporte} en el aula</span>
                <span className="bg-green-50 text-green-700 px-2 py-1 rounded-full">{preview.con_nota} con nota final</span>
                <span className="bg-amber-50 text-amber-700 px-2 py-1 rounded-full">{preview.sin_nota} en curso (no se importan)</span>
                {preview.unmatched.length > 0 && (
                  <span className="bg-rose-50 text-rose-700 px-2 py-1 rounded-full">{preview.unmatched.length} sin identificar en el ERP</span>
                )}
                {preview.ya_registradas_activa > 0 && (
                  <span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full">{preview.ya_registradas_activa} ya registradas (Activa) — se saltan</span>
                )}
                {preview.rellenan_pendiente > 0 && (
                  <span className="bg-teal-50 text-teal-700 px-2 py-1 rounded-full">{preview.rellenan_pendiente} rellenan nota pendiente</span>
                )}
                {preview.nuevas > 0 && (
                  <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-full">{preview.nuevas} nuevas</span>
                )}
              </div>
              {preview.cerradas > 0 && (
                <div className="flex items-center gap-3 text-xs bg-gray-100 text-gray-700 rounded-lg px-3 py-2">
                  🔒 <b>Acta cerrada</b>: {preview.cerradas} nota(s) selladas — ninguna importación puede tocarlas (el editor manual sí).
                  Si el aula se limpió para otra cohorte, esto protege lo ya registrado.
                  <button onClick={() => setLock('unlock')} className="ml-auto text-blue-600 hover:underline">Reabrir acta</button>
                </div>
              )}
              <div className="max-h-72 overflow-auto border border-gray-100 rounded-lg">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="text-[11px] text-gray-400 uppercase tracking-wide bg-gray-50 sticky top-0">
                      <th className="text-left px-3 py-2">Estudiante</th>
                      <th className="text-left px-3 py-2">Documento</th>
                      <th className="text-right px-3 py-2">Nota final</th>
                      <th className="text-left px-3 py-2">Destino</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {preview.matched.map((m, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 text-gray-800">{m.name}</td>
                        <td className="px-3 py-1.5 text-gray-500">{m.document}</td>
                        <td className={`px-3 py-1.5 text-right font-medium ${m.total == null ? 'text-gray-300' : 'text-gray-800'}`}>{m.total ?? 'en curso'}</td>
                        <td className={`px-3 py-1.5 text-xs ${
                          m.destino === 'ya registrada (Activa)' ? 'text-indigo-600'
                            : m.destino === 'rellena pendiente' ? 'text-teal-600'
                              : m.destino === 'nueva' ? 'text-blue-600' : 'text-gray-300'}`}>{m.destino}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.unmatched.length > 0 && (
                <details className="text-xs text-gray-500">
                  <summary className="cursor-pointer">Ver los {preview.unmatched.length} sin identificar</summary>
                  <ul className="mt-1 space-y-0.5">
                    {preview.unmatched.map((u, i) => <li key={i}>{u.fullname} <span className="text-gray-300">idnumber: {u.idnumber || '(vacío)'}</span></li>)}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      )}

      {/* Destino e importación — SOLO por vínculo exacto */}
      {selected && preview && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">3 · Destino en el expediente</h3>
          {selected.linked ? (
            <>
              <div className="flex items-center gap-2 text-sm rounded-lg px-3 py-2 bg-green-50 text-green-800">
                <span className="font-medium">{selected.linked.course.code} · {selected.linked.course.name}</span>
                <span className="text-xs opacity-70">{selected.linked.course.program}</span>
                <span className="text-[10px] font-medium bg-white/70 px-1.5 py-0.5 rounded-full">
                  vínculo exacto{selected.linked.group ? ` · grupo ${selected.linked.group}` : ''}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Año (term)</label>
                  <input value={termYear} onChange={e => setTermYear(e.target.value)} inputMode="numeric"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Bloque (term)</label>
                  <input value={termBlock} onChange={e => setTermBlock(e.target.value)} placeholder="Ej. AY_25-26_SPRING_2026"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <button onClick={doImport} disabled={importing || !termBlock.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Importar {preview.rellenan_pendiente + preview.nuevas} notas al expediente
              </button>
              <p className="text-[11px] text-gray-400">
                Solo entran los alumnos identificados y con nota final. Reimportar es seguro: actualiza lo que cambió y
                nunca pisa una nota corregida a mano en el ERP.
              </p>
            </>
          ) : (
            <div className="text-sm bg-amber-50 text-amber-800 rounded-lg px-4 py-3">
              Esta aula no está vinculada a ninguna asignatura, así que no se puede importar. El vínculo se configura en el
              detalle del grupo correspondiente (columna &quot;ID curso Moodle&quot; de la asignatura). Las aulas de campus socio
              (otras plataformas) se cargan por el importador CSV.
            </div>
          )}
        </div>
      )}

      {error && <div className="text-sm bg-rose-50 text-rose-700 rounded-lg px-4 py-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{error}</div>}

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800 space-y-2">
          <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="w-4 h-4" />Acta importada</p>
          <p>
            {result.inserted} notas nuevas · {result.updated} actualizadas · {result.unchanged} sin cambios · {result.protected_rows} protegidas (editadas a mano)
            {result.locked_rows > 0 ? ` · ${result.locked_rows} selladas (acta cerrada)` : ''}
          </p>
          <p className="text-green-700">{result.detalles_escritos} actas detalladas espejadas (evaluaciones con sus ponderaciones).</p>
          {(result.ya_registradas_activa > 0 || result.rellenadas_pendientes > 0) && (
            <p className="text-green-700">
              {result.ya_registradas_activa > 0 ? `${result.ya_registradas_activa} ya registradas de Activa (intactas, no se duplicaron)` : ''}
              {result.ya_registradas_activa > 0 && result.rellenadas_pendientes > 0 ? ' · ' : ''}
              {result.rellenadas_pendientes > 0 ? `${result.rellenadas_pendientes} notas pendientes rellenadas y blindadas contra el sync` : ''}
            </p>
          )}
          <button onClick={() => setLock('lock')}
            className="text-xs font-medium bg-white border border-green-300 text-green-800 rounded-lg px-3 py-1.5 hover:bg-green-100">
            🔒 Cerrar acta — sellar estas notas contra futuras importaciones
          </button>
          {(result.sin_puente > 0 || result.sin_total > 0) && (
            <p className="text-green-700">{result.sin_puente} sin identificar y {result.sin_total} en curso no se importaron.</p>
          )}
          {result.recompute && !result.recompute.error && (
            <p className="text-green-700">
              Efectos: {result.recompute.egresados_detectados} egresados detectados · {result.recompute.situaciones_actualizadas} situaciones actualizadas · {result.recompute.avances_de_carrusel} avances de carrusel.
            </p>
          )}
          {result.recompute?.error && <p className="text-amber-700">{result.recompute.error}</p>}
          {result.errors.length > 0 && <p className="text-rose-700">Errores: {result.errors.join(' · ')}</p>}
        </div>
      )}
    </div>
  )
}
