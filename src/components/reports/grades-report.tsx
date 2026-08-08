'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Play, GraduationCap, AlertTriangle } from 'lucide-react'

interface Cat { id: string; name: string }
interface Prog { id: string; name: string; category_id: string | null }
interface Course { id: string; name: string; code: string | null; program_id: string }
interface Year { id: string; name: string }
interface Sem { id: string; name: string; academic_year_id: string }
interface Conv { id: string; name: string; academic_semester_id: string | null }
interface Group { id: string; name: string; abbreviation: string | null; program_id: string | null; category_id: string | null }
interface Catalogos {
  categorias: Cat[]; programas: Prog[]; asignaturas: Course[]
  anios: Year[]; semestres: Sem[]; convocatorias: Conv[]; carruseles: Group[]
}
interface Fila {
  external_id: string; documento: string; estudiante: string; situacion: string | null
  programa: string | null; asignatura: string; codigo: string | null
  periodo: string | null; nota: number | null; minimo: number | null; estado: string
}
interface Resultado {
  resumen: {
    estudiantes: number; calificaciones: number
    aprobados: number; en_proceso: number; desaprobados: number
    promedio: number | null; notas_promediadas: number; sin_periodo: number
    por_semestre: number; por_anio: number; solo_semestre: boolean
  }
  detalle: boolean; aviso: string | null; filas: Fila[]
}

const EST: Record<string, { label: string; cls: string }> = {
  aprobado: { label: 'Aprobado', cls: 'bg-green-50 text-green-700' },
  desaprobado: { label: 'Desaprobado', cls: 'bg-red-50 text-red-700' },
  en_proceso: { label: 'En proceso', cls: 'bg-amber-50 text-amber-700' },
}
const sel = 'w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400'

export function GradesReport() {
  const [cat, setCat] = useState<Catalogos | null>(null)
  const [categoria, setCategoria] = useState('')
  const [programa, setPrograma] = useState('')
  const [asignatura, setAsignatura] = useState('')
  const [anio, setAnio] = useState('')
  // Los tres criterios de periodo son excluyentes: elegir uno limpia los otros.
  const [criterio, setCriterio] = useState<'semestre' | 'convocatoria' | 'carrusel'>('semestre')
  const [periodo, setPeriodo] = useState('')
  const [res, setRes] = useState<Resultado | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/reports/grades').then(r => r.json()).then(d => {
      if (d.error) setError(d.error); else setCat(d)
    }).catch(() => setError('No se pudieron cargar los filtros'))
  }, [])

  // Cascada: el programa depende de la categoría, la asignatura del programa.
  const programas = useMemo(
    () => (cat?.programas ?? []).filter(p => !categoria || p.category_id === categoria), [cat, categoria])
  const asignaturas = useMemo(
    () => (cat?.asignaturas ?? []).filter(c => programa ? c.program_id === programa
      : categoria ? programas.some(p => p.id === c.program_id) : true), [cat, programa, categoria, programas])

  // El semestre cuelga del año; la convocatoria, del semestre; el carrusel no
  // tiene año, así que con carrusel el año no filtra.
  const semestres = useMemo(
    () => (cat?.semestres ?? []).filter(s => !anio || s.academic_year_id === anio), [cat, anio])
  const convocatorias = useMemo(
    () => (cat?.convocatorias ?? []).filter(c => !anio || semestres.some(s => s.id === c.academic_semester_id)), [cat, anio, semestres])
  const carruseles = useMemo(
    () => (cat?.carruseles ?? []).filter(g => programa ? g.program_id === programa
      : categoria ? g.category_id === categoria : true), [cat, programa, categoria])

  function cambiarCategoria(v: string) { setCategoria(v); setPrograma(''); setAsignatura('') }
  function cambiarPrograma(v: string) { setPrograma(v); setAsignatura('') }
  function cambiarCriterio(v: 'semestre' | 'convocatoria' | 'carrusel') { setCriterio(v); setPeriodo('') }

  const listo = !!(categoria || programa || asignatura || anio || periodo)

  async function ejecutar() {
    setBusy(true); setError(null); setRes(null)
    const body = {
      category_id: categoria || null, program_id: programa || null, course_id: asignatura || null,
      year_id: anio || null,
      semester_id: criterio === 'semestre' ? periodo || null : null,
      convocatoria_id: criterio === 'convocatoria' ? periodo || null : null,
      group_id: criterio === 'carrusel' ? periodo || null : null,
    }
    const d = await fetch('/api/reports/grades', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then(r => r.json()).catch(() => ({ error: 'La consulta falló' }))
    setBusy(false)
    if (d.error) { setError(d.error); return }
    setRes(d)
  }

  if (!cat && !error) return <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>

  return (
    <div className="space-y-4">
      {error && <p className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</p>}

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Qué se califica</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block"><span className="block text-xs text-gray-500 mb-1">Categoría</span>
              <select className={sel} value={categoria} onChange={e => cambiarCategoria(e.target.value)}>
                <option value="">Todas</option>
                {cat?.categorias.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
            <label className="block"><span className="block text-xs text-gray-500 mb-1">Programa</span>
              <select className={sel} value={programa} onChange={e => cambiarPrograma(e.target.value)} disabled={!categoria}>
                <option value="">{categoria ? 'Todos los de la categoría' : 'Elige una categoría'}</option>
                {programas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></label>
            <label className="block"><span className="block text-xs text-gray-500 mb-1">Asignatura</span>
              <select className={sel} value={asignatura} onChange={e => setAsignatura(e.target.value)} disabled={!programa}>
                <option value="">{programa ? 'Todas las del programa' : 'Elige un programa'}</option>
                {asignaturas.map(c => <option key={c.id} value={c.id}>{c.code ? `${c.code} · ` : ''}{c.name}</option>)}
              </select></label>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Cuándo</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block"><span className="block text-xs text-gray-500 mb-1">Año académico</span>
              <select className={sel} value={anio} onChange={e => { setAnio(e.target.value); setPeriodo('') }}>
                <option value="">Todos</option>
                {cat?.anios.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
              </select></label>
            <label className="block"><span className="block text-xs text-gray-500 mb-1">Criterio</span>
              <select className={sel} value={criterio} onChange={e => cambiarCriterio(e.target.value as 'semestre')}>
                <option value="semestre">Semestre</option>
                <option value="convocatoria">Convocatoria</option>
                <option value="carrusel">Carrusel</option>
              </select></label>
            <label className="block"><span className="block text-xs text-gray-500 mb-1">
              {criterio === 'semestre' ? 'Semestre' : criterio === 'convocatoria' ? 'Convocatoria' : 'Carrusel'}</span>
              <select className={sel} value={periodo} onChange={e => setPeriodo(e.target.value)}>
                <option value="">Todos</option>
                {criterio === 'semestre' && semestres.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                {criterio === 'convocatoria' && convocatorias.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                {criterio === 'carrusel' && carruseles.map(g => <option key={g.id} value={g.id}>{g.abbreviation ? `${g.abbreviation} · ` : ''}{g.name}</option>)}
              </select></label>
          </div>
          {criterio === 'carrusel' && (
            <p className="text-[11px] text-gray-400 mt-1">
              El carrusel agrupa estudiantes, no periodos: filtra por quiénes lo integran hoy, y el año académico sigue acotando las notas.
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button onClick={ejecutar} disabled={busy || !listo}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Ejecutar consulta
          </button>
          {!listo && <span className="text-xs text-gray-400">Elige al menos un filtro.</span>}
        </div>
      </div>

      {res && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Stat label="Estudiantes" value={String(res.resumen.estudiantes)} accent />
            <Stat label="Calificaciones" value={String(res.resumen.calificaciones)} />
            <Stat label="Aprobados" value={String(res.resumen.aprobados)} cls="text-green-700" />
            <Stat label="En proceso" value={String(res.resumen.en_proceso)} cls="text-amber-700" />
            <Stat label="Desaprobados" value={String(res.resumen.desaprobados)} cls="text-red-700" />
            <Stat label="Promedio general" value={res.resumen.promedio != null ? res.resumen.promedio.toFixed(2) : '—'} accent />
          </div>
          <p className="text-[11px] text-gray-400">
            El promedio sale de {res.resumen.notas_promediadas} calificación(es) cerrada(s) —aprobadas y desaprobadas—;
            las que están en proceso son acumulados a medio camino y no se promedian.
            {res.resumen.por_anio > 0 && ` De las calificaciones, ${res.resumen.por_semestre} traen el semestre en su fila y ${res.resumen.por_anio} se ubican por su año lectivo (así llegaron de SystemActiva, que numera los bloques del programa como "1", "2" o "3" en vez de nombrar el semestre).`}
            {res.resumen.solo_semestre && ' Al pedir un semestre concreto solo entran las que lo nombran: una nota que solo trae el año no se puede colocar en Fall o Spring sin inventar.'}
            {res.resumen.sin_periodo > 0 && ` ${res.resumen.sin_periodo} calificación(es) quedaron fuera por no traer ni semestre ni año. Sin filtro de periodo sí entran.`}
          </p>

          {res.aviso && (
            <p className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{res.aviso}
            </p>
          )}

          {res.detalle && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                      <th className="text-left px-4 py-2.5">Estudiante</th>
                      <th className="text-left px-3 py-2.5">Asignatura</th>
                      <th className="text-left px-3 py-2.5 w-44">Periodo</th>
                      <th className="text-center px-3 py-2.5 w-20">Nota</th>
                      <th className="text-center px-3 py-2.5 w-16">Mín.</th>
                      <th className="text-left px-3 py-2.5 w-32">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {res.filas.map(f => {
                      const e = EST[f.estado] ?? EST.en_proceso
                      return (
                        <tr key={f.external_id} className="hover:bg-gray-50/50">
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-gray-800">{f.estudiante}</p>
                            <p className="text-[11px] text-gray-400">{f.documento}{f.programa ? ` · ${f.programa}` : ''}</p>
                          </td>
                          <td className="px-3 py-2.5 text-gray-700">{f.codigo && <span className="text-gray-400">{f.codigo} · </span>}{f.asignatura}</td>
                          <td className="px-3 py-2.5 text-xs text-gray-500">{f.periodo ?? '—'}</td>
                          <td className="px-3 py-2.5 text-center font-semibold tabular-nums text-gray-800">{f.nota != null ? f.nota : '—'}</td>
                          <td className="px-3 py-2.5 text-center text-xs text-gray-400 tabular-nums">{f.minimo ?? '—'}</td>
                          <td className="px-3 py-2.5"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${e.cls}`}>{e.label}</span></td>
                        </tr>
                      )
                    })}
                    {res.filas.length === 0 && (
                      <tr><td colSpan={6} className="text-center text-gray-400 py-12 text-sm">
                        <GraduationCap className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                        Ninguna calificación cumple esos filtros.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Stat({ label, value, accent, cls }: { label: string; value: string; accent?: boolean; cls?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${cls ?? (accent ? 'text-blue-700' : 'text-gray-900')}`}>{value}</p>
    </div>
  )
}
