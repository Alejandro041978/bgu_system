'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, RefreshCw, ShieldCheck, AlertTriangle, ExternalLink, Scale } from 'lucide-react'

interface Aula {
  aula_id: number; shortname: string; fullname: string; visible: boolean
  linked_course: string | null
  recursos: number | null; recursos_activos: number | null
  items_evaluacion: number | null; items_activos: number | null; items_con_peso: number | null
  suma_pesos: number | null; escala_total: number | null
  suma_coeficientes?: number | null; coefs_sync_at?: string | null
  cumple_pesos: boolean | null; cumple_escala: boolean | null
  metodo: string | null; categoria: string | null; error: string | null; audited_at: string
  enrol_methods?: string | null; manual_enrol?: boolean | null; matriculados?: number | null
}
interface Data {
  audited_at: string | null; moodle_url: string | null
  total: number; cumplen: number; incumplen: number
  pesos_mal: number; escala_mal: number
  sin_evaluaciones: number; sin_ponderacion: number
  sin_datos: number; vinculadas: number; sin_matricula_manual: number; coefs_caducados?: number
  audited_at_mas_antigua?: string | null
  familias?: Familia[]
  aulas: Aula[]
}
// Resumen por categoría padre de Moodle: cuánto pesa auditarla y qué tan vieja
// está su foto. Es lo que permite decidir por dónde empezar.
interface Familia {
  ruta: string; nivel: number; nombre: string
  aulas: number; incumplen: number
  sin_matricula_manual: number; sin_datos: number
  audited_at: string | null; mas_antigua: string | null
}

type Filtro = 'todas' | 'incumplen' | 'cumplen' | 'sin_evaluaciones' | 'sin_ponderacion' | 'sin_datos' | 'sin_matricula_manual'

export function CampusAudit() {
  const [d, setD] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Guarda QUÉ se está auditando ('todas' o la familia), no un booleano: así el
  // spinner sale en la fila que corresponde.
  const [auditing, setAuditing] = useState<string | null>(null)
  const [verFamilias, setVerFamilias] = useState(true)
  const [filtro, setFiltro] = useState<Filtro>('incumplen')

  const load = useCallback(async () => {
    const r = await fetch('/api/academic/moodle-audit')
    const data = await r.json()
    if (!r.ok) { setError(data.error ?? 'Error'); return }
    setD(data)
    if ((data.pesos_mal + data.escala_mal) === 0) setFiltro('todas')
  }, [])
  useEffect(() => { load() }, [load])

  // Auditar por familia en vez de todo el campus: menos aulas por corrida (el
  // barrido completo roza el límite de tiempo de Vercel y a veces muere a medio
  // camino) y permite atacar primero la categoría que se está trabajando.
  // El guardado es por tandas, así que una corrida parcial no borra el resto.
  async function audit(familia?: string) {
    const cuantas = familia ? (d?.familias ?? []).find(f => f.ruta === familia)?.aulas : d?.total
    const texto = familia
      ? `Se auditarán las ${cuantas ?? '?'} aulas de "${familia}". El resto del campus conserva su última foto. ¿Continuar?`
      : 'Se auditará el campus COMPLETO contra la política (ponderaciones 100% y escala sobre 100). Toma 1-3 minutos y puede agotar el tiempo; por familia es más seguro. ¿Continuar?'
    if (!confirm(texto)) return
    setAuditing(familia ?? 'todas'); setError(null)
    const r = await fetch('/api/academic/moodle-audit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(familia ? { familia } : {}),
    })
    const data = await r.json()
    setAuditing(null)
    if (!r.ok) { setError(data.error ?? 'Error'); return }
    load()
  }

  // La suma ARITMÉTICA de coeficientes (sync N8N desde la BD de Moodle) manda
  // sobre el peso normalizado del WS: detecta huecos como "3 Module Tests de 4"
  // ⚠ Solo vale si el sync es POSTERIOR a la auditoría: viene de otra tubería
  // (N8N) y puede estar caducado. Un número viejo no tumba una medición nueva.
  const coefVigente = (a: Aula): boolean =>
    a.suma_coeficientes != null && !!a.coefs_sync_at &&
    new Date(a.coefs_sync_at) >= new Date(a.audited_at)
  const cumplePesosDe = (a: Aula): boolean | null => {
    if (coefVigente(a)) return Math.abs(Number(a.suma_coeficientes) - 100) <= 0.5
    return a.cumple_pesos
  }
  // Misma precedencia que la API: cada aula vive en UNA sola categoría
  const estadoDe = (a: Aula): Filtro => {
    if (a.error) return 'sin_datos'
    if ((a.items_evaluacion ?? 0) === 0) return 'sin_evaluaciones'
    const cp = cumplePesosDe(a)
    if (cp === false || a.cumple_escala === false) return 'incumplen'
    if (cp === true && a.cumple_escala === true) return 'cumplen'
    return 'sin_ponderacion'
  }
  // "Sin matriculación manual" NO entra en la precedencia de estadoDe: es una
  // condición transversal. Un aula puede cumplir la política de pesos y aun así
  // ser inalcanzable para el ERP, que es justo lo que la hacía invisible.
  const visibles = (d?.aulas ?? []).filter(a =>
    filtro === 'todas' ? true
      : filtro === 'sin_matricula_manual' ? a.manual_enrol === false
        : estadoDe(a) === filtro)

  // Agrupación por categoría de Moodle
  const grupos = new Map<string, Aula[]>()
  for (const a of visibles) {
    const k = a.categoria ?? '(sin categoría)'
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k)!.push(a)
  }
  const gruposOrdenados = [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-xs text-gray-400">
          {d?.audited_at ? (
            <>
              <p>Auditoría más reciente: {new Date(d.audited_at).toLocaleString()}</p>
              {/* Con auditorías por familia la foto deja de ser homogénea: lo
                  que engaña es la más reciente, no la más vieja. */}
              {d.audited_at_mas_antigua && d.audited_at_mas_antigua.slice(0, 10) !== d.audited_at.slice(0, 10) && (
                <p className="text-amber-600">Hay aulas sin auditar desde {new Date(d.audited_at_mas_antigua).toLocaleDateString()}</p>
              )}
            </>
          ) : 'Aún no se ha auditado el campus.'}
        </div>
        <button onClick={() => audit()} disabled={!!auditing}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-60">
          {auditing === 'todas' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {auditing === 'todas' ? 'Auditando el campus…' : 'Auditar todo el campus'}
        </button>
      </div>

      {/* Auditoría por familia: menos aulas por corrida y prioridad a la
          categoría que se esté trabajando. */}
      {d && (d.familias?.length ?? 0) > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <button onClick={() => setVerFamilias(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50">
            <span className="text-sm font-semibold text-gray-800">Auditar por categoría de Moodle</span>
            <span className="text-xs text-gray-400">{verFamilias ? 'ocultar' : `${d.familias!.length} categorías`}</span>
          </button>
          {verFamilias && (
            <div className="overflow-x-auto border-t border-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    <th className="text-left px-3 py-2 w-full">Categoría</th>
                    <th className="text-right px-3 py-2">Aulas</th>
                    <th className="text-right px-3 py-2">Incumplen</th>
                    <th className="text-right px-3 py-2">Sin matrícula</th>
                    <th className="text-left px-3 py-2">Auditada</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {d.familias!.map(f => {
                    const dias = f.mas_antigua ? Math.floor((Date.now() - new Date(f.mas_antigua).getTime()) / 86400000) : null
                    return (
                      <tr key={f.ruta} className={`hover:bg-gray-50/50 ${f.nivel === 1 ? 'bg-gray-50/60' : ''}`}>
                        {/* Nivel 1 = lo que se ve en la portada de Moodle;
                            nivel 2 = la unidad real de trabajo (p. ej. Update
                            dentro de DCE). */}
                        <td className={f.nivel === 1 ? 'px-3 py-2 text-gray-800 font-semibold' : 'px-3 py-2 pl-8 text-gray-600'}>
                          {f.nombre}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600">{f.aulas}</td>
                        <td className={`px-3 py-2 text-right font-medium ${f.incumplen > 0 ? 'text-rose-700' : 'text-gray-300'}`}>{f.incumplen || '—'}</td>
                        <td className={`px-3 py-2 text-right font-medium ${f.sin_matricula_manual > 0 ? 'text-rose-700' : 'text-gray-300'}`}>{f.sin_matricula_manual || '—'}</td>
                        {/* La fecha REAL, que es el dato que manda; lo relativo
                            va debajo como ayuda de lectura. Y si dentro de la
                            familia hay aulas de otro día, se dice: significa que
                            una corrida anterior se cortó a medio camino. */}
                        <td className="px-3 py-2 text-xs whitespace-nowrap">
                          {f.audited_at ? (
                            <>
                              <span className={dias != null && dias >= 7 ? 'text-amber-600 font-medium' : 'text-gray-700'}>
                                {new Date(f.audited_at).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <span className="block text-[10.5px] text-gray-400">
                                {dias === 0 ? 'hoy' : `hace ${dias} d`}
                                {f.mas_antigua && f.audited_at.slice(0, 10) !== f.mas_antigua.slice(0, 10) && (
                                  <span className="text-amber-600"> · parcial desde {new Date(f.mas_antigua).toLocaleDateString('es-PE')}</span>
                                )}
                              </span>
                            </>
                          ) : <span className="text-gray-300">sin auditar</span>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => audit(f.ruta)} disabled={!!auditing}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:underline disabled:opacity-40 disabled:no-underline whitespace-nowrap">
                            {auditing === f.ruta ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            {auditing === f.ruta ? 'Auditando…' : 'Auditar'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {error && <div className="text-sm bg-rose-50 text-rose-700 rounded-lg px-4 py-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{error}</div>}

      {/* La Σ aritmética viene de N8N, no de la auditoría: si quedó vieja, su
          señal se ignora (no puede tumbar una medición nueva) pero se pierde la
          detección de huecos que el webservice no ve. */}
      {d && (d.coefs_caducados ?? 0) > 0 && (
        <div className="text-[13px] bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            <strong>{d.coefs_caducados} aulas</strong> tienen la suma de coeficientes sincronizada ANTES de su última
            auditoría, así que se está ignorando. La política se evalúa solo con el webservice, que no detecta huecos
            del tipo &ldquo;faltan 3 de 4 Module Tests&rdquo;. Vuelve a correr el sync de coeficientes en N8N para recuperar
            esa señal.
          </span>
        </div>
      )}

      {d && d.total > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <button onClick={() => setFiltro('todas')} className={`rounded-lg p-3 text-left border ${filtro === 'todas' ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}>
              <p className="text-2xl font-bold text-gray-900">{d.total}</p>
              <p className="text-xs text-gray-500">Aulas</p>
            </button>
            <button onClick={() => setFiltro('cumplen')} className={`rounded-lg p-3 text-left border ${filtro === 'cumplen' ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}>
              <p className="text-2xl font-bold text-green-700">{d.cumplen}</p>
              <p className="text-xs text-green-700">Cumplen la política</p>
            </button>
            <button onClick={() => setFiltro('incumplen')} className={`rounded-lg p-3 text-left border ${filtro === 'incumplen' ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}>
              <p className="text-2xl font-bold text-rose-700">{d.incumplen}</p>
              <p className="text-xs text-rose-700">Incumplen (pesos {d.pesos_mal} · escala {d.escala_mal})</p>
            </button>
            <button onClick={() => setFiltro('sin_ponderacion')} className={`rounded-lg p-3 text-left border ${filtro === 'sin_ponderacion' ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}>
              <p className="text-2xl font-bold text-amber-700">{d.sin_ponderacion}</p>
              <p className="text-xs text-amber-700">Sin ponderación reportada</p>
            </button>
            <button onClick={() => setFiltro('sin_evaluaciones')} className={`rounded-lg p-3 text-left border ${filtro === 'sin_evaluaciones' ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}>
              <p className="text-2xl font-bold text-gray-600">{d.sin_evaluaciones}</p>
              <p className="text-xs text-gray-500">Sin evaluaciones (no académicas)</p>
            </button>
            <button onClick={() => setFiltro('sin_datos')} className={`rounded-lg p-3 text-left border ${filtro === 'sin_datos' ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}>
              <p className="text-2xl font-bold text-amber-700">{d.sin_datos}</p>
              <p className="text-xs text-amber-700">Sin datos (error)</p>
            </button>
            {/* El aula donde el ERP no puede matricular se queda sin alumnos, y
                entonces la importación devuelve vacío SIN error. Es el fallo que
                no se ve: por eso tiene tarjeta propia. */}
            <button onClick={() => setFiltro('sin_matricula_manual')} className={`rounded-lg p-3 text-left border ${filtro === 'sin_matricula_manual' ? 'border-blue-400 bg-blue-50' : d.sin_matricula_manual > 0 ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}>
              <p className={`text-2xl font-bold ${d.sin_matricula_manual > 0 ? 'text-red-700' : 'text-gray-600'}`}>{d.sin_matricula_manual}</p>
              <p className={`text-xs ${d.sin_matricula_manual > 0 ? 'text-red-700' : 'text-gray-500'}`}>Sin matriculación manual (el ERP no puede matricular)</p>
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  <th className="text-left px-3 py-3 w-full">Aula</th>
                  <th className="text-left px-3 py-3">Vinculada a</th>
                  <th className="text-right px-3 py-3">Recursos</th>
                  <th className="text-right px-3 py-3">Evaluados</th>
                  <th className="text-right px-3 py-3">Con peso</th>
                  <th className="text-right px-3 py-3">Σ pesos</th>
                  <th className="text-right px-3 py-3">Escala</th>
                  <th className="text-left px-3 py-3">Matrícula</th>
                  <th className="text-left px-3 py-3">Política</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {gruposOrdenados.map(([cat, aulasGrupo]) => [
                  <tr key={`cat-${cat}`} className="bg-gray-100/80">
                    <td colSpan={9} className="px-4 py-2">
                      <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">{cat}</span>
                      <span className="text-[11px] text-gray-500 ml-3">
                        {aulasGrupo.length} aula(s)
                        {' · '}<span className="text-green-700">{aulasGrupo.filter(x => x.cumple_pesos && x.cumple_escala).length} cumplen</span>
                        {' · '}<span className="text-rose-700">{aulasGrupo.filter(x => x.cumple_pesos === false || x.cumple_escala === false).length} incumplen</span>
                        {/* La fecha de ESTE grupo, no la del campus: con
                            auditorías parciales cada categoría va por su cuenta. */}
                        {(() => {
                          const fechas = aulasGrupo.map(x => x.audited_at).filter(Boolean).sort()
                          if (!fechas.length) return null
                          const dias = Math.floor((Date.now() - new Date(fechas[0]).getTime()) / 86400000)
                          return <>{' · '}<span className={dias >= 7 ? 'text-amber-600' : 'text-gray-400'}>
                            auditada {new Date(fechas[fechas.length - 1]).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span></>
                        })()}
                      </span>
                    </td>
                  </tr>,
                  ...aulasGrupo.map(a => (
                  <tr key={a.aula_id} className="hover:bg-gray-50/50">
                    <td className="px-3 py-2">
                      {d.moodle_url ? (
                        <a href={`${d.moodle_url}/course/view.php?id=${a.aula_id}`} target="_blank" rel="noopener noreferrer"
                          className="text-gray-800 leading-snug hover:text-blue-600 hover:underline inline-flex items-center gap-1">
                          {a.shortname}<ExternalLink className="w-3 h-3 text-gray-300" />
                        </a>
                      ) : (
                        <p className="text-gray-800 leading-snug">{a.shortname}</p>
                      )}
                      <p className="text-[11px] text-gray-400">
                        #{a.aula_id}{!a.visible ? ' · oculta' : ''}
                        {d.moodle_url && (
                          <a href={`${d.moodle_url}/grade/edit/tree/index.php?id=${a.aula_id}`} target="_blank" rel="noopener noreferrer"
                            className="ml-2 text-blue-500 hover:underline inline-flex items-center gap-0.5" title="Configuración de calificaciones (pesos y escala)">
                            <Scale className="w-3 h-3" />calificaciones
                          </a>
                        )}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap max-w-[200px] truncate">{a.linked_course ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap">
                      {a.recursos != null ? <><b className="text-gray-800">{a.recursos_activos ?? '?'}</b><span className="text-gray-400"> / {a.recursos}</span></> : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap">
                      {a.items_evaluacion != null ? <><b className="text-gray-800">{a.items_activos ?? '?'}</b><span className="text-gray-400"> / {a.items_evaluacion}</span></> : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600">{a.items_con_peso ?? '—'}</td>
                    <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${cumplePesosDe(a) === false ? 'text-rose-700' : cumplePesosDe(a) ? 'text-green-700' : 'text-gray-300'}`}>
                      {a.suma_coeficientes != null
                        ? <span title="Suma aritmética de coeficientes (BD Moodle)">{`Σ ${a.suma_coeficientes}`}</span>
                        : a.suma_pesos != null ? `${a.suma_pesos}%` : '—'}
                    </td>
                    <td className={`px-3 py-2 text-right whitespace-nowrap ${a.cumple_escala === false ? 'text-rose-700 font-medium' : a.cumple_escala ? 'text-green-700' : 'text-gray-300'}`}>
                      {a.escala_total != null ? a.escala_total : '—'}
                    </td>
                    {/* Si el ERP no puede matricular, el aula se queda sin
                        alumnos y la importación devuelve vacío SIN error. */}
                    <td className="px-3 py-2 whitespace-nowrap text-xs">
                      {a.manual_enrol === false ? (
                        <span className="text-rose-700 font-medium" title={a.enrol_methods ?? undefined}>sin manual</span>
                      ) : a.manual_enrol === true ? (
                        <span className={a.matriculados === 0 ? 'text-amber-600' : 'text-gray-500'} title={a.enrol_methods ?? undefined}>
                          {a.matriculados != null ? `${a.matriculados} matric.` : 'manual'}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {estadoDe(a) === 'sin_datos'
                        ? <span className="text-[11px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">{a.error}</span>
                        : estadoDe(a) === 'sin_evaluaciones'
                          ? <span className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">sin evaluaciones</span>
                          : estadoDe(a) === 'incumplen'
                            ? <span className="text-[11px] bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full">
                              {[cumplePesosDe(a) === false ? (a.suma_coeficientes != null ? `Σ coefs = ${a.suma_coeficientes}` : 'pesos ≠ 100%') : null, a.cumple_escala === false ? 'escala ≠ 100' : null].filter(Boolean).join(' · ')}
                            </span>
                            : estadoDe(a) === 'cumplen'
                              ? <span className="text-[11px] bg-green-50 text-green-700 px-2 py-0.5 rounded-full inline-flex items-center gap-1"><ShieldCheck className="w-3 h-3" />cumple</span>
                              : <span className="text-[11px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">sin ponderación reportada</span>}
                    </td>
                  </tr>
                  )),
                ])}
              </tbody>
            </table>
            {visibles.length === 0 && <p className="text-sm text-gray-400 text-center py-8">Nada que mostrar con este filtro.</p>}
          </div>

          <div className="text-[11px] text-gray-400 space-y-1">
            <p><b>Auditoría estructural</b>: mide el diseño del aula, tenga o no estudiantes y tenga o no calificaciones. <b>Política</b>: las ponderaciones de los recursos evaluados <b>activos</b> (de primer nivel) suman 100% y el total del curso está sobre 100. Los recursos ocultos no cuentan.</p>
            <p><b>Σ = suma aritmética de coeficientes</b> (sincronizada desde la base de Moodle vía N8N): a diferencia del peso normalizado —que siempre cierra en 100—, la Σ delata huecos reales del patrón (ej. Σ 95 = falta un Module Test de 5%).</p>
            <p><b>Recursos</b> = módulos del aula (activos / total). <b>Evaluados</b> = con entrada en el libro de calificaciones; <b>con peso</b> = activos que ponderan en la nota.</p>
            <p>Las aulas vacías se leen con la cuenta de servicio &quot;Auditor ERP&quot; (se matricula un instante y se retira). Las aulas se reutilizan entre cohortes: vuelve a auditar tras cada preparación de bloque.</p>
          </div>
        </>
      )}
    </div>
  )
}
