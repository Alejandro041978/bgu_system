'use client'

import { useEffect, useState } from 'react'
import { Loader2, Settings2, Zap } from 'lucide-react'

// ---------------------------------------------------------------------------
// Lo CARGADO en una matrícula (colección + carrusel de entrada), su reflejo
// efectivo y la activación por excepción. Vive en la ficha del estudiante
// porque los reportes ya no actúan (regla del usuario, 17/09/2026): la
// vendedora carga, el pago ejecuta, los reportes reflejan. Editar aquí solo
// corrige el DATO; la colocación la ejecuta la activación.
// ---------------------------------------------------------------------------
interface Setup {
  enrollment_id: string; status: string | null; activada: boolean
  collection_id: string | null; entry_group_id: string | null
  efectivo: { group_id: string; label: string; status: string } | null
  colecciones: { id: string; name: string; active: boolean }[]
  carruseles: { id: string; label: string }[]
}

const sel = 'border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

export function EnrollmentSetup({ enrollmentId, onChanged }: { enrollmentId: string; onChanged?: () => void }) {
  const [s, setS] = useState<Setup | null>(null)
  const [editando, setEditando] = useState(false)
  const [col, setCol] = useState('')
  const [car, setCar] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const cargar = () => fetch(`/api/admision/matricula/setup?enrollment_id=${enrollmentId}`).then(r => r.json()).then(d => {
    if (d.error) return
    setS(d); setCol(d.collection_id ?? ''); setCar(d.entry_group_id ?? '')
  }).catch(() => {})
  useEffect(() => { cargar() }, [enrollmentId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function guardar() {
    setBusy(true); setMsg(null)
    const r = await fetch('/api/admision/matricula/setup', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enrollment_id: enrollmentId, collection_id: col || null, entry_group_id: car || null }),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setMsg({ kind: 'error', text: d.error ?? 'No se pudo guardar' }); return }
    setEditando(false)
    setMsg({ kind: 'ok', text: 'Carga corregida. Se ejecuta al activarse la matrícula.' })
    cargar(); onChanged?.()
  }

  async function activar() {
    if (!s) return
    const yaActiva = s.activada
    if (!confirm(yaActiva
      ? 'La matrícula ya está activa. ¿Re-ejecutar la activación? Es idempotente: coloca en el carrusel cargado si aún no está colocado, y no duplica nada.'
      : 'Activación MANUAL por excepción (lo normal es que se active sola al pagarse los conceptos iniciales). Se registrará su malla, se creará su correo y se colocará en el carrusel cargado. ¿Continuar?')) return
    setBusy(true); setMsg(null)
    const r = await fetch('/api/admision/matricula/activate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enrollment_id: enrollmentId, force: true }),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok || d.error) { setMsg({ kind: 'error', text: d.error ?? 'No se pudo activar' }); return }
    setMsg({ kind: 'ok', text: `Activación ejecutada — colocación: ${d.colocacion?.note ?? d.result?.colocacion?.note ?? 'hecha'}` })
    cargar(); onChanged?.()
  }

  if (!s) return <div className="pl-6 text-xs text-gray-300">…</div>
  const colName = s.colecciones.find(c => c.id === s.collection_id)?.name ?? null
  const carLabel = s.carruseles.find(c => c.id === s.entry_group_id)?.label ?? null
  const difiere = s.efectivo && s.entry_group_id && s.efectivo.group_id !== s.entry_group_id

  return (
    <div className="pl-6 text-xs space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <Settings2 className="w-3.5 h-3.5 text-gray-300 shrink-0" />
        <span className={`px-1.5 py-0.5 rounded text-[11px] ${s.activada ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
          {s.activada ? 'activa' : (s.status === 'pendiente_pago' ? 'pendiente de pago' : (s.status ?? 'sin estado'))}
        </span>
        {!editando ? (
          <>
            <span className="text-gray-600">
              Cargado: colección <b className="text-gray-800">{colName ?? '—'}</b> · carrusel de entrada <b className="text-gray-800">{carLabel ?? '—'}</b>
            </span>
            <button onClick={() => setEditando(true)} className="text-blue-600 hover:underline">corregir</button>
          </>
        ) : (
          <>
            <select value={col} onChange={e => setCol(e.target.value)} className={sel}>
              <option value="">— colección —</option>
              {s.colecciones.map(c => <option key={c.id} value={c.id}>{c.name}{c.active ? '' : ' (inactiva)'}</option>)}
            </select>
            <select value={car} onChange={e => setCar(e.target.value)} className={sel}>
              <option value="">— carrusel de entrada —</option>
              {s.carruseles.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <button onClick={guardar} disabled={busy} className="text-blue-600 hover:underline disabled:opacity-50">{busy ? '…' : 'guardar'}</button>
            <button onClick={() => { setEditando(false); setCol(s.collection_id ?? ''); setCar(s.entry_group_id ?? '') }} className="text-gray-400 hover:underline">cancelar</button>
          </>
        )}
        <button onClick={activar} disabled={busy}
          title={s.activada ? 'Re-ejecutar la activación (idempotente)' : 'Activación manual por excepción; lo normal es que se active con el pago'}
          className="ml-auto inline-flex items-center gap-1 text-gray-500 hover:text-blue-700 disabled:opacity-50">
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
          {s.activada ? 're-ejecutar activación' : 'activar (excepción)'}
        </button>
      </div>
      {difiere && (
        <p className="text-amber-700">⚠ Lo cargado ({carLabel}) difiere de la colocación efectiva ({s.efectivo!.label}): el estudiante ya avanzó o fue colocado antes de la carga.</p>
      )}
      {s.activada && !s.efectivo && (
        <p className="text-amber-700">⚠ Matrícula activa SIN colocación en carrusel: {s.entry_group_id ? 're-ejecuta la activación para colocarlo en lo cargado.' : 'carga el carrusel de entrada y re-ejecuta la activación.'}</p>
      )}
      {msg && <p className={msg.kind === 'ok' ? 'text-green-700' : 'text-red-600'}>{msg.text}</p>}
    </div>
  )
}
