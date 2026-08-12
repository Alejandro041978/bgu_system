'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, CheckCircle2, RefreshCw } from 'lucide-react'

interface Hallazgo {
  tipo: 'titulo' | 'fuentes' | 'convalidada' | 'sin_ficha'
  aula_id?: number; aula?: string | null; coleccion?: string | null
  dice: string; contra: string; notas: number; detalle: string
}
interface Data {
  revisadas: number; total: number
  por_tipo: { titulo: number; fuentes: number; convalidada: number; sin_ficha: number }
  hallazgos: Hallazgo[]
}

const TIPO: Record<Hallazgo['tipo'], { label: string; cls: string; explica: string }> = {
  titulo: {
    label: 'Título ≠ código', cls: 'bg-amber-50 text-amber-800 border-amber-200',
    explica: 'El aula se vincula por el código de su nombre. Si su título nombra a otra asignatura de la misma malla, una de las dos cosas está mal escrita — y las notas se archivan según el código.',
  },
  fuentes: {
    label: 'Colección ≠ oferta', cls: 'bg-red-50 text-red-800 border-red-200',
    explica: 'Las dos fuentes de identidad del aula no coinciden. En los cuatro casos encontrados hasta hoy, la oferta tenía razón y la colección estaba equivocada.',
  },
  convalidada: {
    label: 'Convalidada con notas', cls: 'bg-violet-50 text-violet-800 border-violet-200',
    explica: 'Una asignatura convalidada está recibiendo calificaciones. Suele ser la consecuencia visible de un aula mal identificada.',
  },
  sin_ficha: {
    label: 'Nota sin ficha', cls: 'bg-orange-50 text-orange-800 border-orange-200',
    explica: 'El documento de la nota no corresponde a ningún estudiante. Los casos vistos venían mal escritos desde SystemActiva —un punto suelto, un documento sin sus guiones, una CURP cortada— y eran notas de gente real que no aparecían en su expediente.',
  },
}

export function LinkAudit() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const d = await fetch('/api/academic/link-audit').then(r => r.json()).catch(() => ({ error: 'Error de red' }))
    setLoading(false)
    if (d.error) { setError(d.error); return }
    setData(d)
  }, [])
  useEffect(() => { load() }, [load])

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
  if (error) return <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{error}</p>
  if (!data) return null

  return (
    <div className="space-y-5">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm text-gray-600 leading-relaxed">
            Un aula se vincula a su asignatura <strong>por código</strong>, y así debe seguir: los nombres chocan entre
            programas y media colección está en español contra una malla en inglés. Lo que esta pantalla hace es
            contrastar ese vínculo con las otras evidencias que ya tenemos, para que una contradicción se vea el día
            que aparece y no meses después, en el expediente de alguien.
          </p>
          <button onClick={load} className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800">
            <RefreshCw className="w-3.5 h-3.5" /> Revisar
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">{data.revisadas} aulas vinculadas revisadas.</p>
      </div>

      {data.total === 0 ? (
        <p className="text-sm text-green-800 bg-green-50 px-4 py-3 rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> Sin contradicciones: cada aula coincide con su título, con la oferta, y
          ninguna asignatura convalidada está recibiendo notas.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {(['fuentes', 'titulo', 'sin_ficha', 'convalidada'] as const).map(t => data.por_tipo[t] > 0 && (
              <span key={t} className={`text-xs px-2.5 py-1 rounded-full border ${TIPO[t].cls}`}>
                {data.por_tipo[t]} · {TIPO[t].label}
              </span>
            ))}
          </div>

          {(['fuentes', 'titulo', 'sin_ficha', 'convalidada'] as const).map(t => {
            const items = data.hallazgos.filter(h => h.tipo === t)
            if (!items.length) return null
            return (
              <div key={t} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className={`px-4 py-3 border-b ${TIPO[t].cls}`}>
                  <p className="text-sm font-semibold">{TIPO[t].label} · {items.length}</p>
                  <p className="text-xs mt-0.5 opacity-90">{TIPO[t].explica}</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {items.map((h, i) => (
                    <div key={`${h.aula_id ?? h.dice}-${i}`} className="px-4 py-3">
                      <div className="flex items-baseline justify-between gap-4">
                        <p className="text-sm text-gray-800">
                          {h.aula_id ? <span className="text-gray-400">aula {h.aula_id} · </span> : null}
                          {h.aula ?? h.dice}
                        </p>
                        <span className="text-xs text-gray-400 shrink-0">
                          {h.notas} {h.tipo === 'convalidada' ? 'estudiante(s)' : 'nota(s)'}
                          {h.coleccion ? ` · ${h.coleccion}` : ''}
                        </span>
                      </div>
                      {h.tipo === 'sin_ficha' && (
                        <p className="text-xs text-gray-600 mt-1">
                          documento <b>{h.dice}</b> · la nota dice que es de <b>{h.contra}</b>
                        </p>
                      )}
                      {h.tipo === 'titulo' || h.tipo === 'fuentes' ? (
                        <p className="text-xs text-gray-600 mt-1">
                          el ERP dice <b>{h.dice}</b> · contra <b>{h.contra}</b>
                        </p>
                      ) : null}
                      <p className="text-[11px] text-gray-400 mt-0.5">{h.detalle}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
