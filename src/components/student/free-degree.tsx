'use client'

import { useEffect, useState } from 'react'
import { Loader2, GraduationCap, UserPlus, CheckCircle2 } from 'lucide-react'

interface Referido {
  id: string; nombre: string; email: string; programa: string | null
  estado: string; creado: string
}
interface Data {
  elegible: boolean; motivo?: string
  credito?: { inscritos: number; ganado: number; aplicado: number; disponible: number; faltan_referidos: number }
  costo_degree?: number; por_referido?: number
  programas?: { id: string; name: string }[]
  referidos?: Referido[]
}

const EST: Record<string, { label: string; cls: string }> = {
  registrado:      { label: 'Registrado',                 cls: 'bg-gray-100 text-gray-600' },
  contactado:      { label: 'Contactado',                 cls: 'bg-blue-50 text-blue-700' },
  en_conversacion: { label: 'En conversación',            cls: 'bg-amber-50 text-amber-700' },
  inscrito:        { label: 'Inscrito',                   cls: 'bg-green-50 text-green-700' },
  sin_interes:     { label: 'Sin interés',                cls: 'bg-gray-100 text-gray-500' },
  del_equipo:      { label: 'Ya en proceso con Admisión', cls: 'bg-violet-50 text-violet-700' },
  duplicado:       { label: 'Ya estaba referido',         cls: 'bg-gray-100 text-gray-500' },
}
const money = (n: number) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

// Códigos más frecuentes de la base; el resto se escribe a mano.
const CODIGOS = ['+51', '+52', '+57', '+58', '+591', '+593', '+56', '+54', '+507', '+1', '+34']

export function FreeDegree() {
  const [d, setD] = useState<Data | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [f, setF] = useState({ first_name: '', last_name: '', email: '', phone_code: '+51', phone_local: '', program_id: '', consent: false })

  async function load() {
    const j = await fetch('/api/student/referrals').then(r => r.json()).catch(() => null)
    if (j?.error) setError(j.error); else setD(j)
  }
  useEffect(() => { load() }, [])

  async function enviar() {
    setBusy(true); setError(null); setOk(null)
    const j = await fetch('/api/student/referrals', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f),
    }).then(r => r.json())
    setBusy(false)
    if (j.error) { setError(j.error); return }
    setOk(j.aviso ?? '¡Listo! Antonella se pondrá en contacto con tu referido.')
    setF({ ...f, first_name: '', last_name: '', email: '', phone_local: '', program_id: '', consent: false })
    load()
  }

  if (!d && !error) return <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>

  if (d && !d.elegible) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl py-16 text-center">
        <GraduationCap className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">{d.motivo}</p>
      </div>
    )
  }

  const c = d?.credito
  const listo = f.first_name.trim() && f.email.trim() && f.phone_local.trim() && f.consent

  return (
    <div className="space-y-4">
      {/* El marcador: es lo que empuja a seguir refiriendo. */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-2xl p-5">
        <p className="text-xs uppercase tracking-wide opacity-80">Free Degree</p>
        <p className="text-3xl font-bold mt-1">{money(c?.ganado ?? 0)} <span className="text-lg font-normal opacity-80">de {money(d?.costo_degree ?? 400)}</span></p>
        <p className="text-sm opacity-90 mt-1">
          {c && c.ganado >= (d?.costo_degree ?? 400)
            ? '¡Tu derecho de titulación está cubierto!'
            : `Te ${c?.faltan_referidos === 1 ? 'falta 1 referido inscrito' : `faltan ${c?.faltan_referidos ?? 4} referidos inscritos`} para no pagar tu titulación.`}
        </p>
        <div className="flex gap-6 mt-4 text-sm">
          <span><b>{c?.inscritos ?? 0}</b> <span className="opacity-80">inscritos</span></span>
          <span><b>{money(c?.aplicado ?? 0)}</b> <span className="opacity-80">ya aplicado</span></span>
          <span><b>{money(c?.disponible ?? 0)}</b> <span className="opacity-80">disponible</span></span>
        </div>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed">
        Recomienda a quien creas que puede estudiar con nosotros. Antonella lo contacta y le cuenta que tú nos hablaste
        de él. Por cada referido que llega a matricularse ganas <b>{money(d?.por_referido ?? 100)}</b> de descuento sobre
        tu derecho de titulación, que cuesta {money(d?.costo_degree ?? 400)}. Puedes ayudar hablando con él: mientras
        antes se decida, antes suma.
      </p>

      {error && <p className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</p>}
      {ok && <p className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">{ok}</p>}

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-800 flex items-center gap-2"><UserPlus className="w-4 h-4 text-blue-500" />Recomendar a alguien</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block"><span className="block text-xs text-gray-500 mb-1">Nombre</span>
            <input className={inp} value={f.first_name} onChange={e => setF({ ...f, first_name: e.target.value })} /></label>
          <label className="block"><span className="block text-xs text-gray-500 mb-1">Apellidos</span>
            <input className={inp} value={f.last_name} onChange={e => setF({ ...f, last_name: e.target.value })} /></label>
          <label className="block"><span className="block text-xs text-gray-500 mb-1">Correo</span>
            <input className={inp} type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></label>
          {/* Código y número SIEMPRE en la misma línea, el código primero. */}
          <label className="block"><span className="block text-xs text-gray-500 mb-1">Celular</span>
            <div className="flex gap-2">
              <select className={`${inp} w-24 shrink-0`} value={f.phone_code} onChange={e => setF({ ...f, phone_code: e.target.value })}>
                {CODIGOS.map(c2 => <option key={c2} value={c2}>{c2}</option>)}
              </select>
              <input className={inp} inputMode="numeric" value={f.phone_local} onChange={e => setF({ ...f, phone_local: e.target.value })} />
            </div></label>
          <label className="block sm:col-span-2"><span className="block text-xs text-gray-500 mb-1">¿Qué programa podría interesarle?</span>
            <select className={inp} value={f.program_id} onChange={e => setF({ ...f, program_id: e.target.value })}>
              <option value="">Todavía no lo sé</option>
              {(d?.programas ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
        </div>
        <label className="flex items-start gap-2 text-xs text-gray-600">
          <input type="checkbox" className="mt-0.5" checked={f.consent} onChange={e => setF({ ...f, consent: e.target.checked })} />
          Confirmo que tengo su permiso para compartir su correo y su celular con Blackwell Global University.
        </label>
        <button onClick={enviar} disabled={busy || !listo}
          className="inline-flex items-center gap-2 text-sm font-semibold bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}Registrar referido
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <p className="px-4 py-2.5 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-100">
          Mis referidos ({d?.referidos?.length ?? 0})
        </p>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-50">
            {(d?.referidos ?? []).map(r => {
              const e = EST[r.estado] ?? EST.registrado
              return (
                <tr key={r.id}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-gray-800">{r.nombre}</p>
                    <p className="text-[11px] text-gray-400">{r.programa ?? 'Sin programa definido'}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${e.cls}`}>{e.label}</span>
                    {r.estado === 'inscrito' && <span className="ml-2 text-xs font-semibold text-green-700">+$100</span>}
                  </td>
                </tr>
              )
            })}
            {!(d?.referidos ?? []).length && (
              <tr><td className="px-4 py-10 text-center text-sm text-gray-400">Todavía no has recomendado a nadie.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
