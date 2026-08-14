'use client'

import { useEffect, useState } from 'react'
import { Loader2, Mail, Phone, MapPin, IdCard, GraduationCap, Info } from 'lucide-react'

interface Programa { nombre: string | null; desde: string | null; estado: string | null }
interface Ficha {
  nombre: string
  documento: string | null; tipo_documento: string | null
  fecha_nacimiento: string | null; pais_nacimiento: string | null
  pais: string | null; ciudad: string | null
  telefono: string | null
  correo_personal: string | null; correo_institucional: string | null
  programas: Programa[]
}

const fecha = (s: string | null) => {
  if (!s) return null
  const d = new Date(s.length <= 10 ? `${s}T00:00:00` : s)
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' })
}

function Dato({ etiqueta, valor, nota }: { etiqueta: string; valor: string | null; nota?: string }) {
  return (
    <div className="py-3 border-b border-gray-100 last:border-0">
      <p className="text-[11px] uppercase tracking-wide text-gray-400">{etiqueta}</p>
      <p className={`text-sm mt-0.5 break-all ${valor ? 'text-gray-900' : 'text-gray-400 italic'}`}>
        {valor || 'sin registrar'}
      </p>
      {nota && <p className="text-[11px] text-gray-400 mt-0.5">{nota}</p>}
    </div>
  )
}

function Bloque({ icono, titulo, children }: { icono: React.ReactNode; titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 bg-gray-50 border-b border-gray-100">
        <span className="text-gray-400">{icono}</span>
        <h2 className="text-sm font-semibold text-gray-700">{titulo}</h2>
      </div>
      <div className="px-5 py-1">{children}</div>
    </div>
  )
}

export function StudentProfileView() {
  const [f, setF] = useState<Ficha | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/student/profile')
        const d = await r.json().catch(() => ({ error: `El servidor respondió ${r.status}` }))
        if (!r.ok || d.error) { setError(d.error ?? 'No se pudo cargar tu ficha'); return }
        setF(d)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error de red')
      } finally { setLoading(false) }
    })()
  }, [])

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
  if (error) return <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{error}</p>
  if (!f) return null

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex gap-2.5">
        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-900 leading-relaxed">
          Estos son los datos que la universidad tiene registrados a tu nombre. <strong>Revísalos</strong>:
          si algo está mal escrito —sobre todo tu correo— podrías dejar de recibir tus enlaces de acceso y
          nuestros avisos. Para corregir cualquier dato, escribe a Servicios al Estudiante.
        </p>
      </div>

      <Bloque icono={<IdCard className="w-4 h-4" />} titulo="Identificación">
        <Dato etiqueta="Nombre completo" valor={f.nombre} />
        <Dato etiqueta={f.tipo_documento || 'Documento'} valor={f.documento} />
        <Dato etiqueta="Fecha de nacimiento" valor={fecha(f.fecha_nacimiento)} />
        <Dato etiqueta="País de nacimiento" valor={f.pais_nacimiento} />
      </Bloque>

      <Bloque icono={<Mail className="w-4 h-4" />} titulo="Cómo te contactamos">
        <Dato etiqueta="Correo personal" valor={f.correo_personal}
          nota="A esta dirección te llega el enlace para entrar al portal." />
        <Dato etiqueta="Correo institucional" valor={f.correo_institucional}
          nota="Tu cuenta @blackwell.pro. También sirve para entrar." />
        <Dato etiqueta="Teléfono" valor={f.telefono} />
      </Bloque>

      <Bloque icono={<MapPin className="w-4 h-4" />} titulo="Residencia">
        <Dato etiqueta="País" valor={f.pais} />
        <Dato etiqueta="Ciudad" valor={f.ciudad} />
      </Bloque>

      {!!f.programas.length && (
        <Bloque icono={<GraduationCap className="w-4 h-4" />} titulo={f.programas.length > 1 ? 'Tus programas' : 'Tu programa'}>
          {f.programas.map((p, i) => (
            <div key={i} className="py-3 border-b border-gray-100 last:border-0">
              <p className="text-sm text-gray-900">{p.nombre ?? '—'}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {p.desde ? `Desde ${fecha(p.desde)}` : 'Sin fecha de matrícula'}
                {p.estado ? ` · ${p.estado}` : ''}
              </p>
            </div>
          ))}
        </Bloque>
      )}

      <p className="text-xs text-gray-400 flex items-center gap-1.5 px-1">
        <Phone className="w-3.5 h-3.5" />
        ¿Ves algo que no corresponde? Escríbenos y lo corregimos.
      </p>
    </div>
  )
}
