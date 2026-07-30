'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import { Loader2, Upload, CreditCard, AlertTriangle, ExternalLink, RefreshCw, Mail, Smartphone, Camera, Pencil } from 'lucide-react'

interface Row {
  card_number: string; status: string; printed_name: string | null
  valid_from: string | null; valid_to: string | null; isic_status: string | null
  assigned_at: string | null; last_http_code: number | null; last_error: string | null
  registration_url: string | null; student_name: string; document_number: string | null
  profile_status: string | null; notified_at: string | null; email: string | null
  student_id: string | null; has_photo: boolean
}
interface Evento { card_number: string | null; action: string; http_code: number | null; ok: boolean | null; response_body: string | null; created_at: string }
interface Data {
  environment: string; configured: boolean
  totals: { available: number; assigned: number; voided: number; total: number }
  rows: Row[]; eventos: Evento[]
}

const fecha = (s: string | null) => (s ? new Date(s).toLocaleDateString('es-PE') : '—')

export function IsicCards() {
  const [d, setD] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [numbers, setNumbers] = useState('')
  const [env, setEnv] = useState<'staging' | 'production'>('staging')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  // Panel de actualización de un carné ya emitido
  const [editando, setEditando] = useState<string | null>(null)
  const [nuevaFoto, setNuevaFoto] = useState<File | null>(null)
  const [avisar, setAvisar] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/registrar/isic')
    const j = await res.json()
    setD(res.ok ? j : null)
    if (res.ok) setEnv(j.environment === 'production' ? 'production' : 'staging')
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function importar() {
    setBusy(true); setMsg(null)
    const res = await fetch('/api/registrar/isic', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numbers, environment: env }),
    })
    const j = await res.json()
    setBusy(false)
    if (!res.ok) { setMsg(j.error ?? 'No se pudo importar'); return }
    setMsg(`Importadas ${j.importadas} · ya existían ${j.ya_existian}${j.invalidos?.length ? ` · con formato inválido ${j.invalidos.length}` : ''}`)
    setNumbers('')
    load()
  }

  // Actualizar un carné emitido: el estudiante pidió otra foto o corregir un
  // dato. Los datos se releen de su ficha; aquí solo se elige la foto nueva.
  async function actualizar(r: Row) {
    setBusy(true); setMsg(null)
    let photoPath: string | null = null
    if (nuevaFoto && r.student_id) {
      const fd = new FormData()
      fd.append('file', nuevaFoto); fd.append('student_id', r.student_id)
      const up = await fetch('/api/registrar/isic-photo', { method: 'POST', body: fd })
      const uj = await up.json()
      if (!up.ok) { setBusy(false); setMsg(uj.error ?? 'No se pudo subir la foto'); return }
      photoPath = uj.path
    }
    const res = await fetch('/api/registrar/isic', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_number: r.card_number, action: 'update', photo_path: photoPath, notify: avisar }),
    })
    const j = await res.json()
    setBusy(false)
    if (!res.ok) { setMsg(j.error ?? 'No se pudo actualizar'); return }
    setMsg(`Carné actualizado en ISIC (${j.http_code})${j.photo_updated ? ' · foto reemplazada' : ''}${j.notified ? ' · aviso enviado' : ''}`)
    setEditando(null); setNuevaFoto(null); setAvisar(false)
    load()
  }

  async function accion(card: string, action: 'profile' | 'notify') {
    setBusy(true); setMsg(null)
    const res = await fetch('/api/registrar/isic', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_number: card, action }),
    })
    const j = await res.json()
    setBusy(false)
    if (!res.ok) { setMsg(j.error ?? 'No se pudo completar la acción'); return }
    if (action === 'notify') setMsg(`Correo reenviado a ${j.sent_to}`)
    if (action === 'profile') setMsg(j.profile_status ? `Activado en la app (${j.profile_status})` : 'Todavía no lo ha activado en la app')
    load()
  }

  if (loading) return <div className="py-20 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>
  if (!d) return <p className="text-sm text-gray-500 py-12 text-center">No se pudo cargar el inventario.</p>

  const pocas = d.totals.available > 0 && d.totals.available <= 25

  return (
    <div className="space-y-5">
      {!d.configured && (
        <div className="flex items-start gap-2 p-3 rounded-xl border border-amber-200 bg-amber-50 text-[13px] text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Faltan las credenciales de ISIC (<code>ISIC_USER</code> / <code>ISIC_PASSWORD</code>). Se pueden importar licencias, pero no emitir carnés.</span>
        </div>
      )}

      {/* Entorno + inventario */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Entorno activo</p>
          <p className={`text-lg font-bold ${d.environment === 'production' ? 'text-green-600' : 'text-amber-600'}`}>
            {d.environment === 'production' ? 'Producción' : 'Staging'}
          </p>
          <p className="text-[10.5px] text-gray-400 mt-0.5">Lo define <code>ISIC_BASE_URL</code></p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Disponibles</p>
          <p className={`text-lg font-bold ${pocas ? 'text-amber-600' : 'text-gray-800'}`}>{d.totals.available}</p>
          {pocas && <p className="text-[10.5px] text-amber-600 mt-0.5">Quedan pocas: pide el siguiente bloque</p>}
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Asignadas</p>
          <p className="text-lg font-bold text-gray-800">{d.totals.assigned}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Total del bloque</p>
          <p className="text-lg font-bold text-gray-800">{d.totals.total}</p>
        </div>
      </div>

      {/* Importar bloque */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
        <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5"><Upload className="w-4 h-4 text-gray-400" /> Importar bloque de licencias</p>
        <p className="text-[12px] text-gray-500">
          Pega los números que envió ISIC, uno por línea (o separados por comas). La letra de control no se puede
          calcular a partir del correlativo, así que se importan tal cual: nunca se generan.
        </p>
        <textarea value={numbers} onChange={e => setNumbers(e.target.value)} rows={5}
          placeholder={'S034500092211K\nS034500092212X\nS034500092213N'}
          className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <div className="flex items-center gap-2">
          <select value={env} onChange={e => setEnv(e.target.value as 'staging' | 'production')}
            className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="staging">Staging (pruebas)</option>
            <option value="production">Producción</option>
          </select>
          <button onClick={importar} disabled={busy || !numbers.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Importar
          </button>
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
            <RefreshCw className="w-4 h-4" /> Actualizar
          </button>
          {msg && <span className="text-[12px] text-gray-600">{msg}</span>}
        </div>
        <p className="text-[11px] text-amber-700">
          Un número de carné es intransferible: una vez asignado no se reasigna. Reimportar el bloque no devuelve al
          inventario las licencias ya entregadas.
        </p>
      </div>

      {/* Asignadas */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
            <CreditCard className="w-4 h-4 text-gray-400" /> Carnés emitidos
          </p>
          <p className="text-[11.5px] text-gray-500 mt-1 flex items-start gap-1.5">
            <Smartphone className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" />
            <span>
              Emitir no es activar. El carné es digital y vive en la app de ISIC: la cuenta del estudiante nace cuando
              abre el enlace <strong>en su teléfono</strong> con la app ya instalada — no hay usuario ni contraseña que
              entregarle. ISIC no manda ningún correo, el aviso lo enviamos nosotros.
            </span>
          </p>
        </div>
        {d.rows.length === 0 ? (
          <p className="text-sm text-gray-400 py-12 text-center">Todavía no se ha emitido ningún carné en este entorno.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Nº de carné</th>
                  <th className="px-3 py-2 text-left font-medium">Estudiante</th>
                  <th className="px-3 py-2 text-left font-medium">Nombre impreso</th>
                  <th className="px-3 py-2 text-left font-medium">Vigencia</th>
                  <th className="px-3 py-2 text-left font-medium">CCDB</th>
                  <th className="px-3 py-2 text-left font-medium">Activado</th>
                  <th className="px-3 py-2 text-left font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {d.rows.map(r => (
                  <Fragment key={r.card_number}>
                  <tr className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 font-mono text-[12.5px] text-gray-800">{r.card_number}</td>
                    <td className="px-3 py-2.5">
                      <span className="text-gray-800">{r.student_name || '—'}</span>
                      {r.document_number && <span className="text-[11px] text-gray-400 block">{r.document_number}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">{r.printed_name ?? '—'}</td>
                    <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{fecha(r.valid_from)} → {fecha(r.valid_to)}</td>
                    <td className="px-3 py-2.5">
                      {r.last_error ? (
                        <span className="text-[11px] text-red-600" title={r.last_error}>
                          {r.last_http_code ?? 'error'} · falló
                        </span>
                      ) : (
                        <span className="text-[11px] text-green-600">
                          {r.last_http_code === 201 ? '201 creada' : r.last_http_code === 200 ? '200 actualizada' : (r.isic_status ?? '—')}
                        </span>
                      )}
                    </td>
                    {/* Emitir no es activar: el carné digital solo llega al
                        estudiante cuando abre el enlace con la app instalada. */}
                    <td className="px-3 py-2.5">
                      {r.profile_status ? (
                        <span className="text-[11px] text-green-600 font-medium">✓ {r.profile_status}</span>
                      ) : (
                        <button onClick={() => accion(r.card_number, 'profile')} disabled={busy}
                          className="text-[11px] text-gray-400 hover:text-blue-600 disabled:opacity-50" title="Consultar a ISIC si ya lo activó">
                          sin confirmar · comprobar
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        {r.registration_url && (
                          <a href={r.registration_url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:underline"
                            title="Es un enlace para el TELÉFONO: abre la app de ISIC. En una computadora solo muestra la página de descarga.">
                            <ExternalLink className="w-3.5 h-3.5" /> Enlace
                          </a>
                        )}
                        <button onClick={() => accion(r.card_number, 'notify')} disabled={busy || !r.email}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-blue-600 disabled:opacity-40"
                          title={r.email ? `Reenviar instrucciones a ${r.email}` : 'Sin correo registrado'}>
                          <Mail className="w-3.5 h-3.5" /> {r.notified_at ? 'Reenviar' : 'Avisar'}
                        </button>
                        <button onClick={() => { setEditando(editando === r.card_number ? null : r.card_number); setNuevaFoto(null); setAvisar(false); setMsg(null) }}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-blue-600"
                          title="Cambiar la foto o empujar a ISIC los datos corregidos en la ficha">
                          <Pencil className="w-3.5 h-3.5" /> Actualizar
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editando === r.card_number && (
                    <tr className="bg-blue-50/40">
                      <td colSpan={7} className="px-3 py-3">
                        <div className="space-y-2 max-w-2xl">
                          <p className="text-[12.5px] font-medium text-gray-800">Actualizar {r.card_number} en ISIC</p>
                          <p className="text-[11.5px] text-gray-600 leading-relaxed">
                            Los datos del titular se releen de la ficha del estudiante, no se escriben aquí: si un nombre
                            o una fecha están mal, corrígelos en su ficha y pulsa Actualizar — el carné sigue. Así el
                            carné y el ERP nunca dicen cosas distintas.
                            <br />
                            <strong>La vigencia no cambia.</strong> Extenderla es revalidar, que es otro trámite con su
                            propio pago.
                          </p>
                          <div className="flex items-center gap-3 flex-wrap">
                            <label className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 cursor-pointer">
                              <Camera className="w-3.5 h-3.5" />
                              {nuevaFoto ? nuevaFoto.name.slice(0, 28) : r.has_photo ? 'Reemplazar foto (opcional)' : 'Agregar foto (opcional)'}
                              <input type="file" accept="image/jpeg,image/png" className="hidden"
                                onChange={e => { const f = e.target.files?.[0]; if (f) setNuevaFoto(f); e.target.value = '' }} />
                            </label>
                            <label className="inline-flex items-center gap-1.5 text-[11.5px] text-gray-600">
                              <input type="checkbox" checked={avisar} onChange={e => setAvisar(e.target.checked)} className="rounded border-gray-300" />
                              Reenviar el correo al estudiante
                            </label>
                          </div>
                          {avisar && (
                            <p className="text-[11px] text-gray-500">
                              Conviene si cambió el nombre o el correo: el enlace de activación los lleva dentro, así que
                              el que tenía quedó obsoleto.
                            </p>
                          )}
                          <div className="flex gap-2 pt-0.5">
                            <button onClick={() => actualizar(r)} disabled={busy}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
                              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pencil className="w-3.5 h-3.5" />} Actualizar en ISIC
                            </button>
                            <button onClick={() => { setEditando(null); setNuevaFoto(null) }} disabled={busy}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-50">
                              Cancelar
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bitácora */}
      {d.eventos.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-gray-800 mb-2">Últimas llamadas a ISIC</p>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {d.eventos.map((e, i) => (
              <p key={i} className="text-[11.5px] font-mono text-gray-600">
                <span className="text-gray-400">{new Date(e.created_at).toLocaleString('es-PE')}</span>{'  '}
                <span className={e.ok ? 'text-green-600' : 'text-red-600'}>{e.http_code ?? '—'}</span>{'  '}
                {e.action}{'  '}{e.card_number ?? ''}
                {!e.ok && e.response_body && <span className="text-red-500"> · {e.response_body.slice(0, 160)}</span>}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
