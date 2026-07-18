'use client'

import { useState } from 'react'
import { Loader2, Upload, Download, CheckCircle2, AlertTriangle, FileSpreadsheet } from 'lucide-react'

interface OkRow { fila: number; document: string; student_name: string; course_code: string | null; course_name: string; grade: number; destino: string }
interface ErrRow { fila: number; motivo: string; documento?: string }
interface Preview { validas: number; con_error: number; omitidas_activa: number; ok: OkRow[]; errores: ErrRow[]; omitidas: ErrRow[] }
interface ApplyResult {
  inserted: number; updated: number; unchanged: number; protected_rows: number; errors: string[]
  recompute: { egresados_detectados?: number; situaciones_actualizadas?: number; avances_de_carrusel?: number; error?: string } | null
}

const TEMPLATE = 'documento,codigo,asignatura,anio,bloque,nota_final\n70123456,ACC 230,Principles of Accounting I,2026,AY_25-26_SPRING_2026,85\n'
const HEADERS = ['documento', 'codigo', 'asignatura', 'anio', 'bloque', 'nota_final']

const normalizeHeader = (h: string) =>
  h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z_]/g, '')

function parseCsv(text: string): { rows: Record<string, string>[]; error: string | null } {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '')
  if (lines.length < 2) return { rows: [], error: 'El archivo necesita encabezado y al menos una fila' }
  const delim = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : ','
  const header = lines[0].split(delim).map(normalizeHeader)
  const missing = ['documento', 'anio', 'bloque', 'nota_final'].filter(h => !header.includes(h))
  if (missing.length) return { rows: [], error: 'Faltan columnas: ' + missing.join(', ') + '. Usa la plantilla.' }
  if (!header.includes('codigo') && !header.includes('asignatura')) {
    return { rows: [], error: 'Se necesita la columna codigo o la columna asignatura (o ambas)' }
  }
  const rows = lines.slice(1).map(l => {
    const cells = l.split(delim)
    const r: Record<string, string> = {}
    header.forEach((h, i) => { if (HEADERS.includes(h)) r[h] = (cells[i] ?? '').trim() })
    return r
  })
  return { rows, error: null }
}

export function GradesCsvImport() {
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [checking, setChecking] = useState(false)
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<ApplyResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onFile(f: File | null) {
    setPreview(null); setResult(null); setError(null); setRows([])
    if (!f) return
    setFileName(f.name)
    const text = await f.text()
    const parsed = parseCsv(text)
    if (parsed.error) { setError(parsed.error); return }
    setRows(parsed.rows)
    setChecking(true)
    const r = await fetch('/api/academic/grades-import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: parsed.rows, dry: true }),
    })
    const d = await r.json()
    setChecking(false)
    if (!r.ok) { setError(d.error ?? 'Error'); return }
    setPreview(d)
  }

  async function apply() {
    if (!preview || preview.con_error > 0 || !rows.length) return
    if (!confirm(`Se cargarán ${preview.validas} notas al expediente. ¿Continuar?`)) return
    setApplying(true); setError(null)
    const r = await fetch('/api/academic/grades-import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows, dry: false }),
    })
    const d = await r.json()
    setApplying(false)
    if (!r.ok) { setError(d.error ?? 'Error'); return }
    setResult(d)
    setPreview(null); setRows([]); setFileName(null)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <FileSpreadsheet className="w-4 h-4 text-gray-400" />Archivo CSV
          </h3>
          <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="plantilla_notas.csv"
            className="text-xs text-blue-600 hover:underline flex items-center gap-1">
            <Download className="w-3.5 h-3.5" />Descargar plantilla
          </a>
        </div>
        <label className="flex items-center gap-3 border-2 border-dashed border-gray-200 rounded-xl px-4 py-6 cursor-pointer hover:border-blue-300 transition-colors">
          <Upload className="w-5 h-5 text-gray-400" />
          <div className="text-sm text-gray-600">
            {fileName ? <span className="font-medium">{fileName}</span> : 'Elegir archivo CSV…'}
            <p className="text-[11px] text-gray-400">Columnas: documento, codigo y/o asignatura, anio, bloque, nota_final. Para las aulas de campus socio.</p>
          </div>
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={e => onFile(e.target.files?.[0] ?? null)} />
        </label>
      </div>

      {checking && <div className="py-8 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /><p className="text-xs text-gray-400 mt-2">Validando contra el padrón y las mallas…</p></div>}

      {preview && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Vista previa (nada se ha escrito)</h3>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="bg-green-50 text-green-700 px-2 py-1 rounded-full">{preview.validas} filas válidas</span>
            <span className={`px-2 py-1 rounded-full ${preview.con_error ? 'bg-rose-50 text-rose-700' : 'bg-gray-100 text-gray-500'}`}>{preview.con_error} con error</span>
            {preview.omitidas_activa > 0 && (
              <span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full">{preview.omitidas_activa} ya registradas (Activa) — se omiten</span>
            )}
          </div>

          {preview.errores.length > 0 && (
            <div className="max-h-48 overflow-auto border border-rose-100 rounded-lg">
              <table className="w-full text-sm whitespace-nowrap">
                <thead><tr className="text-[11px] text-rose-500 uppercase tracking-wide bg-rose-50 sticky top-0">
                  <th className="text-left px-3 py-2">Fila</th><th className="text-left px-3 py-2">Documento</th><th className="text-left px-3 py-2">Error</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {preview.errores.map((e, i) => (
                    <tr key={i}><td className="px-3 py-1.5 text-gray-500">{e.fila}</td><td className="px-3 py-1.5 text-gray-500">{e.documento ?? '—'}</td><td className="px-3 py-1.5 text-rose-700">{e.motivo}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {preview.ok.length > 0 && (
            <div className="max-h-64 overflow-auto border border-gray-100 rounded-lg">
              <table className="w-full text-sm whitespace-nowrap">
                <thead><tr className="text-[11px] text-gray-400 uppercase tracking-wide bg-gray-50 sticky top-0">
                  <th className="text-left px-3 py-2">Estudiante</th><th className="text-left px-3 py-2">Documento</th><th className="text-left px-3 py-2">Asignatura</th><th className="text-right px-3 py-2">Nota</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {preview.ok.map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 text-gray-800">{r.student_name}</td>
                      <td className="px-3 py-1.5 text-gray-500">{r.document}</td>
                      <td className="px-3 py-1.5 text-gray-600">{r.course_code} · {r.course_name}</td>
                      <td className="px-3 py-1.5 text-right font-medium text-gray-800">{r.grade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button onClick={apply} disabled={applying || preview.con_error > 0 || preview.validas === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
            {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Aplicar {preview.validas} notas
          </button>
          {preview.con_error > 0 && <p className="text-[11px] text-rose-600">Corrige los errores del archivo y vuelve a subirlo: no se aplica nada mientras haya filas inválidas.</p>}
        </div>
      )}

      {error && <div className="text-sm bg-rose-50 text-rose-700 rounded-lg px-4 py-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{error}</div>}

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800 space-y-1">
          <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="w-4 h-4" />Notas cargadas</p>
          <p>{result.inserted} nuevas · {result.updated} actualizadas · {result.unchanged} sin cambios · {result.protected_rows} protegidas (editadas a mano)</p>
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
