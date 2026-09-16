'use client'

import { useEffect, useState } from 'react'
import { Loader2, Search, CheckCircle2, XCircle, HelpCircle, GraduationCap } from 'lucide-react'
import { CODIGOS_TEL } from '@/lib/graduate-survey'

// ---------------------------------------------------------------------------
// Simulador de convalidación UPGRADE — el mismo widget para la página pública
// (incrustable en la web) y la interna del ERP. Flujo: departamento +
// instituto → carrera (de la lista del instituto u "otra") → veredicto →
// (opcional) datos + WhatsApp para que Admisión contacte.
// ---------------------------------------------------------------------------
interface Instituto {
  codigo_modular: string; nombre: string; licenciado: boolean
  tipo: string | null; departamento: string | null; provincia: string | null; distrito: string | null; fuente: string | null
}
interface Carrera { carrera_key: string; nombre: string; familia: string; califica_admin: boolean; califica_conta: boolean }
interface Veredicto { tipo: 'no_licenciado' | 'califica' | 'no_califica_carrera' | 'evaluacion'; bachelors: string[]; titulo: string; detalle: string }

const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

export function UpgradeSimulatorCore({ apiBase, captura }: { apiBase: string; captura: boolean }) {
  const [deps, setDeps] = useState<string[]>([])
  const [dep, setDep] = useState('')
  const [q, setQ] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [institutos, setInstitutos] = useState<Instituto[] | null>(null)
  // Paginación de 10 en 10 (licenciados primero, luego alfabético). Modo
  // 'todos' = navegar el departamento sin escribir el nombre.
  const [pag, setPag] = useState<{ page: number; pages: number; total: number; modo: 'nombre' | 'todos' }>({ page: 1, pages: 0, total: 0, modo: 'nombre' })
  const [inst, setInst] = useState<Instituto | null>(null)
  const [carreras, setCarreras] = useState<Carrera[]>([])
  const [carreraKey, setCarreraKey] = useState('')
  const [otra, setOtra] = useState('')
  const [veredicto, setVeredicto] = useState<Veredicto | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Contacto
  const [nombre, setNombre] = useState('')
  const [telCode, setTelCode] = useState('+51')
  const [telLocal, setTelLocal] = useState('')
  const [email, setEmail] = useState('')
  const [enviado, setEnviado] = useState(false)

  useEffect(() => {
    fetch(`${apiBase}?departamentos=1`).then(r => r.json()).then(d => setDeps(d.departamentos ?? [])).catch(() => {})
  }, [apiBase])

  async function buscar(modo: 'nombre' | 'todos' = 'nombre', page = 1) {
    if (modo === 'nombre' && q.trim().length < 2) return
    if (modo === 'todos' && !dep) return
    setBuscando(true); setInstitutos(null); setInst(null); setVeredicto(null); setError(null)
    const params = new URLSearchParams()
    if (modo === 'nombre') params.set('q', q.trim())
    if (dep) params.set('departamento', dep)
    params.set('page', String(page))
    const d = await fetch(`${apiBase}?${params.toString()}`).then(r => r.json()).catch(() => ({}))
    setInstitutos(d.institutos ?? [])
    setPag({ page: d.page ?? 1, pages: d.pages ?? 0, total: d.total ?? 0, modo })
    setBuscando(false)
  }

  async function elegir(i: Instituto) {
    setInst(i); setInstitutos(null); setCarreras([]); setCarreraKey(''); setOtra(''); setVeredicto(null); setEnviado(false)
    const d = await fetch(`${apiBase}?codigo=${encodeURIComponent(i.codigo_modular)}`).then(r => r.json()).catch(() => ({}))
    setCarreras(d.carreras ?? [])
  }

  async function simular(conContacto: boolean) {
    if (!inst) return
    if (!carreraKey && !otra.trim() && inst.licenciado) { setError('Elige tu carrera o escríbela.'); return }
    setBusy(true); setError(null)
    const body: Record<string, unknown> = {
      codigo_modular: inst.codigo_modular,
      carrera_key: carreraKey || null,
      carrera_texto: !carreraKey ? (otra.trim() || (inst.licenciado ? null : 'no aplica')) : null,
    }
    if (conContacto) {
      body.nombre = nombre.trim() || null
      body.whatsapp = telLocal ? `${telCode}${telLocal}` : null
      body.email = email.trim() || null
    }
    const r = await fetch(apiBase, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setError(d.error ?? 'No se pudo simular'); return }
    setVeredicto(d.veredicto)
    if (conContacto) setEnviado(true)
  }

  const Icono = veredicto?.tipo === 'califica' ? CheckCircle2 : veredicto?.tipo === 'evaluacion' ? HelpCircle : XCircle
  const colorV = veredicto?.tipo === 'califica' ? 'bg-green-50 border-green-200 text-green-800'
    : veredicto?.tipo === 'evaluacion' ? 'bg-amber-50 border-amber-200 text-amber-800'
    : 'bg-red-50 border-red-200 text-red-800'
  // El contacto se ofrece tras CUALQUIER veredicto: el negativo también invita
  // a escribir (posible error en el registro, o postular por la vía regular).
  const pideContacto = captura && veredicto && !enviado
  const textoContacto: Record<string, { titulo: string; boton: string }> = {
    califica: { titulo: '¿Quieres que Admisión te contacte para iniciar tu convalidación?', boton: 'Quiero que me contacten' },
    evaluacion: { titulo: 'Déjanos tus datos y Admisión evaluará tu caso con tu certificado de estudios', boton: 'Solicitar evaluación' },
    no_licenciado: { titulo: '¿Crees que hay un error en el registro de tu instituto? Déjanos tus datos y lo revisamos contigo', boton: 'Escribirles a Admisión' },
    no_califica_carrera: { titulo: '¿Quieres conocer la vía regular de admisión a nuestros Bachelors? Déjanos tus datos', boton: 'Quiero más información' },
  }
  const tc = veredicto ? (textoContacto[veredicto.tipo] ?? textoContacto.califica) : textoContacto.califica

  return (
    <div className="space-y-4">
      {/* Paso 1: instituto */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-800">1. ¿En qué instituto estudiaste?</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <select value={dep} onChange={e => setDep(e.target.value)} className={`${inp} sm:w-52`}>
            <option value="">Todos los departamentos</option>
            {deps.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') buscar('nombre') }}
            placeholder="Nombre del instituto (ej. SENATI, Cibertec, Idat…)" className={`${inp} flex-1`} />
          <button onClick={() => buscar('nombre')} disabled={buscando || q.trim().length < 2}
            className="inline-flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg">
            {buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Buscar
          </button>
        </div>
        {/* Sin escribir el nombre: recorrer la lista del departamento */}
        <button onClick={() => buscar('todos')} disabled={buscando || !dep}
          title={dep ? `Lista completa de institutos de ${dep}` : 'Elige primero un departamento'}
          className="text-xs text-blue-700 hover:underline disabled:text-gray-300 disabled:no-underline">
          {dep ? `Ver todos los institutos de ${dep} (sin escribir el nombre)` : 'Elige un departamento para ver la lista completa de sus institutos'}
        </button>
        {institutos !== null && (
          <div className="space-y-1">
            {pag.total > 0 && (
              <p className="text-[11px] text-gray-400">
                {pag.total} instituto{pag.total === 1 ? '' : 's'}{pag.modo === 'todos' && dep ? ` en ${dep}` : ''} · página {pag.page} de {pag.pages}
              </p>
            )}
            {institutos.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">No encontramos ese instituto. Prueba con otra parte del nombre o sin filtro de departamento.</p>
            ) : institutos.map(i => (
              <button key={i.codigo_modular} onClick={() => elegir(i)}
                className="w-full text-left flex items-center justify-between gap-3 border border-gray-100 hover:border-blue-300 hover:bg-blue-50/40 rounded-lg px-3 py-2">
                <span className="min-w-0">
                  <span className="block text-sm text-gray-800 truncate">{i.nombre}</span>
                  <span className="block text-[11px] text-gray-400">{[i.distrito, i.provincia, i.departamento].filter(Boolean).join(' · ')}{i.tipo ? ` · ${i.tipo}` : ''}</span>
                </span>
                <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full ${i.licenciado ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {i.licenciado ? 'Licenciado' : 'No licenciado'}
                </span>
              </button>
            ))}
            {pag.pages > 1 && (
              <div className="flex items-center justify-between pt-1">
                <button onClick={() => buscar(pag.modo, pag.page - 1)} disabled={buscando || pag.page <= 1}
                  className="text-xs text-blue-700 hover:underline disabled:text-gray-300 disabled:no-underline">← Anteriores</button>
                <span className="text-[11px] text-gray-400 tabular-nums">{(pag.page - 1) * 10 + 1}–{Math.min(pag.page * 10, pag.total)} de {pag.total}</span>
                <button onClick={() => buscar(pag.modo, pag.page + 1)} disabled={buscando || pag.page >= pag.pages}
                  className="text-xs text-blue-700 hover:underline disabled:text-gray-300 disabled:no-underline">Siguientes 10 →</button>
              </div>
            )}
          </div>
        )}
        {inst && (
          <div className="flex items-center justify-between gap-3 bg-blue-50 rounded-lg px-3 py-2">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-gray-800 truncate">{inst.nombre}</span>
              <span className="block text-[11px] text-gray-500">{[inst.distrito, inst.provincia, inst.departamento].filter(Boolean).join(' · ')}</span>
            </span>
            <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full ${inst.licenciado ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {inst.licenciado ? 'Licenciado por MINEDU' : 'No licenciado'}
            </span>
          </div>
        )}
      </div>

      {/* Paso 2: carrera */}
      {inst && inst.licenciado && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-gray-800">2. ¿Qué carrera estudiaste ahí?</p>
          {carreras.length > 0 ? (
            <div className="space-y-1 max-h-56 overflow-y-auto">
              {carreras.map(c => (
                <label key={c.carrera_key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="radio" name="carrera" checked={carreraKey === c.carrera_key} onChange={() => { setCarreraKey(c.carrera_key); setOtra(''); setVeredicto(null) }} className="w-4 h-4 text-blue-600" />
                  {c.nombre}
                </label>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">Este instituto no tiene carreras registradas en el censo: escribe la tuya.</p>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="radio" name="carrera" checked={!carreraKey && otra !== ''} onChange={() => { setCarreraKey(''); setVeredicto(null) }} className="w-4 h-4 text-blue-600" />
            Otra carrera:
            <input value={otra} onChange={e => { setOtra(e.target.value); setCarreraKey(''); setVeredicto(null) }} placeholder="escríbela" className={`${inp} flex-1`} />
          </label>
        </div>
      )}

      {inst && !veredicto && (
        <button onClick={() => simular(false)} disabled={busy}
          className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold">
          {busy ? 'Verificando…' : 'Ver si califico'}
        </button>
      )}
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {/* Veredicto */}
      {veredicto && (
        <div className={`border rounded-xl px-4 py-4 ${colorV}`}>
          <p className="flex items-center gap-2 text-base font-semibold"><Icono className="w-5 h-5" />{veredicto.titulo}</p>
          <p className="text-sm mt-1 leading-relaxed">{veredicto.detalle}</p>
          {veredicto.tipo === 'califica' && (
            <p className="text-[12px] mt-2 flex items-center gap-1 opacity-80"><GraduationCap className="w-3.5 h-3.5" />Con Upgrade convalidas 20 asignaturas y terminas tu Bachelor en menos tiempo.</p>
          )}
        </div>
      )}

      {/* Contacto (solo versión pública, tras veredicto positivo o de evaluación) */}
      {pideContacto && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-800">{tc.titulo}</p>
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Tu nombre completo" className={inp} />
          <div className="flex gap-1.5">
            <select value={telCode} onChange={e => setTelCode(e.target.value)} className={`${inp} !w-40 shrink-0`}>
              {CODIGOS_TEL.map(([code, n]) => <option key={code} value={code}>{code} {n}</option>)}
            </select>
            <input inputMode="numeric" value={telLocal} onChange={e => setTelLocal(e.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="WhatsApp" className={`${inp} flex-1`} />
          </div>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Correo (opcional)" className={inp} />
          <button onClick={() => simular(true)} disabled={busy || !nombre.trim() || telLocal.length < 6}
            className="w-full py-2.5 rounded-xl bg-[#1a34a8] hover:bg-blue-900 disabled:opacity-50 text-white text-sm font-semibold">
            {busy ? 'Enviando…' : tc.boton}
          </button>
        </div>
      )}
      {enviado && (
        <p className="text-sm text-green-700 bg-green-50 rounded-lg px-4 py-3 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />¡Listo! Un asesor de Admisión te escribirá por WhatsApp.</p>
      )}
    </div>
  )
}
