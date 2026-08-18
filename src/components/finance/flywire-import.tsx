'use client'

import { useState } from 'react'
import { Loader2, Upload, CheckCircle2, AlertTriangle } from 'lucide-react'
import { parseCsv, indicesDeCabecera, esFecha, esImporte, esReferencia, motivoDeDescuadre, ESTADOS_FLYWIRE, type FilaRechazada } from '@/lib/csv'

interface Row {
  reference: string; first_name: string; last_name: string; dni: string
  amount: number; currency: string; country: string; method: string; status: string; finished_date: string | null
}
interface Detalle {
  referencia: string; nombre_csv: string; dni: string | null; monto: number
  estado: string; fecha: string | null; veredicto: string; estudiante: string | null; nota: string | null
}
interface Counts {
  total_csv: number; informativos: number; importar: number; actualizar: number; enriquecer: number
  revertido: number; posible_duplicado: number; sin_estudiante: number; nombre_ambiguo: number
}

// El parser vive en @/lib/csv: entiende comillas escapadas y saltos de línea
// dentro de campo, cosas que el de aquí no hacía.

const CURRENCIES = new Set(['USD', 'PEN', 'EUR', 'COP', 'CLP', 'MXN', 'DOP', 'HNL', 'ARS', 'BOB', 'BRL', 'CRC', 'GTQ', 'NIO', 'PAB', 'PYG', 'UYU', 'VES', 'GBP', 'CAD'])

const V_STYLE: Record<string, string> = {
  importar: 'bg-green-50 text-green-700',
  posible_duplicado: 'bg-amber-50 text-amber-700',
  sin_estudiante: 'bg-red-50 text-red-600',
  nombre_ambiguo: 'bg-red-50 text-red-600',
  revertido: 'bg-red-100 text-red-700 font-semibold',
}
const V_LABEL: Record<string, string> = {
  importar: 'Importar',
  posible_duplicado: 'Se asociará al pago de Activa',
  sin_estudiante: 'Sin estudiante',
  nombre_ambiguo: 'Nombre ambiguo',
  revertido: '⚠ REVERTIDO en Flywire',
}

export function FlywireImport() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [counts, setCounts] = useState<Counts | null>(null)
  const [detalle, setDetalle] = useState<Detalle[]>([])
  const [includeDups, setIncludeDups] = useState(false)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [rechazadas, setRechazadas] = useState<FilaRechazada[]>([])
  const [result, setResult] = useState<{ inserted: number; updated: number; enriched: number; associated: number; linked: number; activadas: number; errors: string[] } | null>(null)

  async function onFile(f: File) {
    setFileName(f.name); setCounts(null); setDetalle([]); setResult(null); setRechazadas([])
    const text = await f.text()
    const parsed = parseCsv(text)
    const idx = indicesDeCabecera(parsed[0] ?? [])
    const col = (n: string) => idx.get(n.toLowerCase()) ?? -1
    const iRef = col('Transfer Reference'), iFn = col('Student First Name'), iLn = col('Student Last Name')
    const iDni = col('DNI'), iAmt = col('Transfer Amount'), iCf = col('Country From'), iCu = col('Currency From')
    const iMet = col('Payment Method'), iSt = col('Payment Status'), iFd = col('Transfer Finished Date')
    if (iRef < 0 || iSt < 0 || iAmt < 0) { alert('El CSV no parece un reporte de Flywire (faltan columnas)'); return }

    // Cada fila se comprueba ANTES de aceptarla.
    //
    // Sin esto entraron filas con las columnas corridas: importe 72.313.558
    // —que era el DNI—, estado "online", fecha "delivered". El giro real era de
    // $150. Ninguno de esos valores es posible en su campo, así que basta con
    // mirar la forma de cada uno para atraparlas todas.
    const rechazadas: FilaRechazada[] = []
    const valida = (r: string[], linea: number): boolean => {
      // Si sobran campos, el resto de comprobaciones va a mirar la columna
      // equivocada y dirá cosas como 'importe no numérico "elizabeth"'. Se
      // informa de la causa —una coma dentro de un nombre sin comillas— en vez
      // de la ristra de síntomas.
      const descuadre = motivoDeDescuadre(r, parsed[0] ?? [])
      if (descuadre) {
        rechazadas.push({ linea, motivo: descuadre, crudo: r.join(',').slice(0, 160) })
        return false
      }
      const motivos: string[] = []
      if (!esReferencia((r[iRef] ?? '').trim())) motivos.push(`referencia inválida "${(r[iRef] ?? '').trim().slice(0, 20)}"`)
      if (!esImporte(r[iAmt] ?? '')) motivos.push(`importe no numérico "${(r[iAmt] ?? '').trim().slice(0, 20)}"`)
      const est = (r[iSt] ?? '').trim().toLowerCase()
      if (est && !ESTADOS_FLYWIRE.has(est)) motivos.push(`estado desconocido "${est.slice(0, 20)}"`)
      const fecha = (r[iFd] ?? '').trim()
      if (fecha && !esFecha(fecha)) motivos.push(`fecha inválida "${fecha.slice(0, 20)}"`)
      if (!motivos.length) return true
      rechazadas.push({ linea, motivo: motivos.join(' · '), crudo: r.join(',').slice(0, 160) })
      return false
    }

    const out: Row[] = parsed.slice(1).filter((r, i) => valida(r, i + 2)).map(r => {
      // El export trae Country From y Currency From invertidas: la moneda es el
      // valor que parezca código ISO; el otro es el país de origen del pago
      const a = (r[iCf] ?? '').trim(), b = (r[iCu] ?? '').trim()
      const currency = CURRENCIES.has(a) ? a : (CURRENCIES.has(b) ? b : a)
      const country = CURRENCIES.has(a) ? b : a
      return {
        reference: (r[iRef] ?? '').trim(),
        first_name: (r[iFn] ?? '').trim(),
        last_name: (r[iLn] ?? '').trim(),
        dni: (r[iDni] ?? '').trim(),
        amount: parseFloat(r[iAmt] || '0') || 0,
        currency,
        country,
        method: (r[iMet] ?? '').trim(),
        status: (r[iSt] ?? '').trim(),
        finished_date: (r[iFd] ?? '').trim() || null,
      }
    }).filter(r => r.reference)
    setRechazadas(rechazadas)
    setRows(out)
    preview(out, includeDups)
  }

  async function preview(data: Row[], dups: boolean) {
    setLoading(true)
    const d = await fetch('/api/finance/flywire-import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: data, include_duplicates: dups }),
    }).then(r => r.json())
    setLoading(false)
    if (d.error) { alert(d.error); return }
    setCounts(d.counts); setDetalle(d.detalle ?? []); setExcluded(new Set())
  }

  async function commit() {
    if (!rows) return
    setLoading(true); setResult(null)
    const d = await fetch('/api/finance/flywire-import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows, commit: true, include_duplicates: includeDups, exclude: [...excluded] }),
    }).then(r => r.json())
    setLoading(false)
    if (d.error) { alert(d.error); return }
    setResult({ inserted: d.inserted, updated: d.updated ?? 0, enriched: d.enriched ?? 0, associated: d.associated ?? 0, linked: d.linked_to_charge, activadas: d.matriculas_activadas ?? 0, errors: d.errors ?? [] })
    preview(rows, includeDups)
  }

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-3 bg-white border-2 border-dashed border-gray-200 hover:border-blue-300 rounded-xl px-5 py-4 cursor-pointer transition-colors">
        <Upload className="w-5 h-5 text-gray-400" />
        <div className="text-sm">
          <p className="font-medium text-gray-700">{fileName || 'Subir reporte CSV de Flywire'}</p>
          <p className="text-xs text-gray-400">Export del dashboard (portal ZBL) — se aceptan re-subidas: nada se duplica</p>
        </div>
        <input type="file" accept=".csv" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
      </label>

      {rechazadas.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3">
            <p className="text-sm font-semibold text-red-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> {rechazadas.length} fila(s) rechazada(s): no se importarán
            </p>
            <p className="text-xs text-red-700 mt-1">
              Sus columnas no tienen la forma que deben —un importe que no es número, una fecha que no es fecha, un
              estado inexistente—. Casi siempre significa que la fila viene corrida. Antes entraban igual: así se
              guardó un giro de $150 como si fuera de 72.313.558, que era el DNI.
            </p>
          </div>
          <div className="max-h-56 overflow-auto border-t border-red-200">
            <table className="w-full text-xs">
              <tbody className="divide-y divide-red-100">
                {rechazadas.slice(0, 50).map(r => (
                  <tr key={r.linea} className="align-top">
                    <td className="px-4 py-1.5 text-red-500 tabular-nums w-16">línea {r.linea}</td>
                    <td className="px-2 py-1.5 text-red-800 font-medium w-72">{r.motivo}</td>
                    <td className="px-4 py-1.5 text-red-400 font-mono truncate">{r.crudo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rechazadas.length > 50 && (
            <p className="px-4 py-2 text-[11px] text-red-500 border-t border-red-200">
              Se muestran las 50 primeras de {rechazadas.length}.
            </p>
          )}
        </div>
      )}

      {loading && <div className="py-8 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>}

      {result && (
        <div className={`text-sm px-4 py-3 rounded-xl ${result.errors.length ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-800'}`}>
          <p className="font-medium">✓ {result.inserted} importados ({result.linked} enlazados a cuota) · {result.updated} actualizados · {result.enriched} enriquecidos por ZBL · {result.associated} asociados por monto/fecha{result.activadas > 0 ? ` · 🎓 ${result.activadas} matrícula(s) ACTIVADA(s)` : ''}.</p>
          {result.errors.map((e, i) => <p key={i} className="text-xs">{e}</p>)}
        </div>
      )}

      {counts && !loading && (
        <>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{counts.total_csv} filas en el CSV</span>
            <span className="bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full">{counts.informativos} initiated/cancelled (no se importan)</span>
            <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full">{counts.actualizar} ya importados (se refresca etapa/fecha)</span>
            {counts.enriquecer > 0 && <span className="bg-purple-50 text-purple-700 px-2.5 py-1 rounded-full font-medium">{counts.enriquecer} históricos de Activa a enriquecer (por ZBL)</span>}
            <span className="bg-green-50 text-green-700 px-2.5 py-1 rounded-full font-medium">{counts.importar} listos para importar</span>
            {counts.revertido > 0 && <span className="bg-red-100 text-red-700 px-2.5 py-1 rounded-full font-semibold">⚠ {counts.revertido} REVERTIDOS (pago registrado que Flywire canceló)</span>}
            {counts.posible_duplicado > 0 && <span className="bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full">{counts.posible_duplicado} se asociarán a su pago de Activa (no se duplican)</span>}
            {(counts.sin_estudiante + counts.nombre_ambiguo) > 0 && <span className="bg-red-50 text-red-600 px-2.5 py-1 rounded-full">{counts.sin_estudiante + counts.nombre_ambiguo} sin resolver</span>}
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={includeDups}
                onChange={e => { setIncludeDups(e.target.checked); if (rows) preview(rows, e.target.checked) }}
                className="w-4 h-4 rounded accent-amber-500" />
              Forzar importación como pagos NUEVOS en vez de asociar (solo si verificaste que el pago de Activa era otro distinto — cuenta el dinero dos veces si te equivocas)
            </label>
            {/* Siempre pulsable: el commit es idempotente y además corre el
                barrido de activación de matrículas (aun con 0 pagos nuevos). */}
            <button onClick={commit} disabled={loading}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium px-5 py-2.5 rounded-xl">
              <CheckCircle2 className="w-4 h-4" />
              {(counts.importar - excluded.size > 0 || counts.enriquecer > 0 || counts.posible_duplicado > 0)
                ? `Procesar: ${Math.max(0, counts.importar - excluded.size)} importar · ${counts.enriquecer} enriquecer · ${counts.posible_duplicado} asociar`
                : 'Procesar (verificar activaciones de matrícula)'}
            </button>
          </div>

          {detalle.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b border-gray-100 text-[11px] text-gray-500 uppercase tracking-wide">
                      <th className="text-left px-4 py-2.5">Referencia</th>
                      <th className="text-left px-3 py-2.5">Nombre en Flywire</th>
                      <th className="text-left px-3 py-2.5">Estudiante ERP</th>
                      <th className="text-right px-3 py-2.5">Monto</th>
                      <th className="text-left px-3 py-2.5">Fecha</th>
                      <th className="text-left px-3 py-2.5">Resultado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {detalle.map(d => (
                      <tr key={d.referencia} className="hover:bg-gray-50/50">
                        <td className="px-4 py-2 font-mono text-xs text-gray-500">{d.referencia}</td>
                        <td className="px-3 py-2 text-gray-700">{d.nombre_csv}{d.dni ? <span className="text-xs text-gray-400"> · {d.dni}</span> : ''}</td>
                        <td className="px-3 py-2 text-gray-700">{d.estudiante ?? <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{d.monto.toFixed(2)}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{d.fecha ?? '—'}</td>
                        <td className="px-3 py-2">
                          {d.veredicto === 'importar' && (
                            <input type="checkbox" checked={!excluded.has(d.referencia)}
                              onChange={e => setExcluded(prev => {
                                const next = new Set(prev)
                                if (e.target.checked) next.delete(d.referencia); else next.add(d.referencia)
                                return next
                              })}
                              className="w-3.5 h-3.5 rounded accent-green-600 mr-1.5 align-middle" title="Desmarcar para NO importar esta fila" />
                          )}
                          <span className={`text-[11px] px-2 py-0.5 rounded-full ${excluded.has(d.referencia) ? 'bg-gray-100 text-gray-400 line-through' : (V_STYLE[d.veredicto] ?? 'bg-gray-100 text-gray-500')}`}>
                            {V_LABEL[d.veredicto] ?? d.veredicto}
                          </span>
                          {d.nota && <span className="text-[11px] text-gray-400 ml-1.5">{d.nota}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="text-[11px] text-gray-400 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            Se importan solo delivered y guaranteed (montos ya en USD). Si la referencia ZBL ya existe en un pago histórico de Activa, se ENRIQUECE (método/moneda/país) sin duplicar ni tocar monto/fecha. El estudiante se resuelve por DNI y, si falta, por nombre; los ambiguos quedan listados para resolverlos a mano. Cada pago nuevo se enlaza a la cuota impaga del mismo monto si existe. Todo el embudo (incl. cancelados) queda en el log para analítica.
          </p>
        </>
      )}
    </div>
  )
}
