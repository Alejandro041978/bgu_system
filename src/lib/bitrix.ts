// ---------------------------------------------------------------------------
// Bitrix24 — el CRM donde trabaja el equipo de admisión.
//
// Se usa para dos cosas del programa Free Degree:
//   · saber si un referido YA lo está trabajando el equipo (solo lectura), y
//   · dejar la negociación creada cuando el referido pasa al estudiante, para
//     que ningún asesor lo tome creyendo que nadie lo atiende.
//
// En Bitrix el correo y el teléfono NO viven en la negociación: viven en el
// contacto. Por eso buscar es en dos pasos —contacto por dato de contacto,
// negociaciones de ese contacto— y no hay atajo.
//
// Se acota a los embudos cuyo nombre empieza por BGU: el CRM tiene muchos más
// y las negociaciones de otras unidades no dicen nada sobre nuestros referidos.
// ---------------------------------------------------------------------------

const PREFIJO_EMBUDO = process.env.BITRIX_PIPELINE_PREFIX || 'BGU'
const ETAPA_UMBRAL = process.env.BITRIX_STAGE_UMBRAL || 'Buscando Decisión'
const USUARIO_BOT = process.env.BITRIX_BOT_USER || 'Bot Bitrix'
/**
 * Embudo donde nacen las negociaciones de referidos.
 *
 * Fijo a propósito: seis de los ocho embudos BGU llevan una fecha en el nombre
 * ("31 AGOSTO") y rotan. Escribir en "el primero de la lista" habría acabado
 * metiendo referidos en un embudo cerrado sin que nadie lo notara.
 */
export const EMBUDO_REFERIDOS = process.env.BITRIX_PIPELINE_REFERRALS || 'BGU FREE DEGREE'

export const bitrixConfigurado = (): boolean => !!process.env.BITRIX_WEBHOOK_URL

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function bitrix(metodo: string, params: Record<string, any> = {}): Promise<any> {
  const base = process.env.BITRIX_WEBHOOK_URL
  if (!base) throw new Error('Bitrix no está configurado')
  const url = `${base.replace(/\/$/, '')}/${metodo}.json`
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    // El CRM no puede hacer esperar al estudiante que está registrando a un amigo.
    signal: AbortSignal.timeout(12_000),
  })
  const j = await r.json().catch(() => null)
  if (!r.ok || j?.error) {
    throw new Error(`Bitrix ${metodo}: ${j?.error_description ?? j?.error ?? r.status}`)
  }
  return j?.result
}

// ── Catálogos ───────────────────────────────────────────────────────────────
// Se piden una vez por instancia y se guardan 10 minutos: son configuración,
// no dato vivo, y pedirlos en cada referido triplicaría las llamadas.
export interface Etapa { id: number; status_id: string; nombre: string; orden: number; semantica: string | null }
export interface Embudo { id: number; nombre: string; etapas: Etapa[] }

let cache: { at: number; embudos: Embudo[] } | null = null
const TTL = 10 * 60 * 1000

export async function embudosBGU(): Promise<Embudo[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.embudos

  // crm.category.list es el método vigente; crm.dealcategory.list sigue vivo en
  // instalaciones que no lo migraron. Se intenta el nuevo y se cae al viejo.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let crudos: any[] = []
  try {
    const r = await bitrix('crm.category.list', { entityTypeId: 2 })
    crudos = (r?.categories ?? []).map((c: { id: number; name: string }) => ({ ID: c.id, NAME: c.name }))
  } catch {
    crudos = await bitrix('crm.dealcategory.list', { order: { SORT: 'ASC' } })
  }

  const bgu = crudos.filter(c => String(c.NAME ?? '').trim().toUpperCase().startsWith(PREFIJO_EMBUDO.toUpperCase()))
  const embudos: Embudo[] = []
  for (const c of bgu) {
    const id = Number(c.ID)
    // El embudo por defecto (0) usa DEAL_STAGE a secas; el resto lleva sufijo.
    const entityId = id === 0 ? 'DEAL_STAGE' : `DEAL_STAGE_${id}`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let etapas: any[] = []
    try {
      etapas = await bitrix('crm.status.list', { filter: { ENTITY_ID: entityId }, order: { SORT: 'ASC' } })
    } catch { etapas = [] }
    embudos.push({
      id, nombre: String(c.NAME ?? ''),
      etapas: etapas.map((e, i) => ({
        id: Number(e.ID),
        status_id: String(e.STATUS_ID),
        nombre: String(e.NAME ?? ''),
        orden: Number(e.SORT ?? i * 10),
        semantica: e.SEMANTICS ?? null,
      })),
    })
  }
  cache = { at: Date.now(), embudos }
  return embudos
}

// ── Búsqueda de un referido en el CRM ───────────────────────────────────────
export interface NegociacionBGU {
  id: string; titulo: string; embudo: string
  etapa: string; etapa_nombre: string; etapa_orden: number; semantica: string | null
  ultima_actividad: string | null
}

/** Contactos que ya tienen ese correo o ese teléfono. */
export async function contactosPor(email: string, telefono: string | null): Promise<number[]> {
  const ids = new Set<number>()
  const busquedas: Promise<unknown>[] = []
  const recoger = async (type: string, valor: string) => {
    try {
      const r = await bitrix('crm.duplicate.findbycomm', { entity_type: 'CONTACT', type, values: [valor] })
      for (const id of r?.CONTACT ?? []) ids.add(Number(id))
    } catch { /* un duplicado no encontrado no es un fallo */ }
  }
  if (email) busquedas.push(recoger('EMAIL', email))
  if (telefono) busquedas.push(recoger('PHONE', telefono))
  await Promise.all(busquedas)
  return [...ids]
}

/** La negociación BGU más avanzada de ese referido, si existe. */
export async function negociacionBGU(email: string, telefono: string | null): Promise<NegociacionBGU | null> {
  const contactos = await contactosPor(email, telefono)
  if (!contactos.length) return null

  const embudos = await embudosBGU()
  if (!embudos.length) return null
  const porId = new Map(embudos.map(e => [e.id, e]))

  const deals = await bitrix('crm.deal.list', {
    filter: { CONTACT_ID: contactos, CATEGORY_ID: embudos.map(e => e.id) },
    select: ['ID', 'TITLE', 'STAGE_ID', 'CATEGORY_ID', 'DATE_CREATE', 'DATE_MODIFY', 'LAST_ACTIVITY_TIME'],
    order: { DATE_MODIFY: 'DESC' },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filas: NegociacionBGU[] = ((deals ?? []) as any[]).map(d => {
    const emb = porId.get(Number(d.CATEGORY_ID))
    const et = emb?.etapas.find(e => e.status_id === String(d.STAGE_ID))
    return {
      id: String(d.ID), titulo: String(d.TITLE ?? ''), embudo: emb?.nombre ?? '',
      etapa: String(d.STAGE_ID), etapa_nombre: et?.nombre ?? String(d.STAGE_ID),
      etapa_orden: et?.orden ?? 0, semantica: et?.semantica ?? null,
      ultima_actividad: d.LAST_ACTIVITY_TIME ?? d.DATE_MODIFY ?? d.DATE_CREATE ?? null,
    }
  })
  if (!filas.length) return null
  // La más avanzada manda: si el equipo la llevó lejos en algún embudo, cuenta.
  return filas.sort((a, b) => b.etapa_orden - a.etapa_orden)[0]
}

/** Posición de la etapa umbral ("Buscando Decisión") dentro de su embudo. */
export async function ordenUmbral(nombreEmbudo: string): Promise<number | null> {
  const embudos = await embudosBGU()
  const emb = embudos.find(e => e.nombre === nombreEmbudo) ?? embudos[0]
  const et = emb?.etapas.find(e => e.nombre.trim().toLowerCase() === ETAPA_UMBRAL.trim().toLowerCase())
  return et ? et.orden : null
}

// ── Escritura: dejar la negociación creada ──────────────────────────────────
let botCache: { at: number; id: number | null } | null = null

export interface UsuarioBitrix { id: number; nombre: string; activo: boolean; email: string | null }

/**
 * Usuarios cuyo nombre contiene "bot". Se recorre el listado en vez de filtrar
 * por NAME/LAST_NAME: el filtro de Bitrix exige el campo exacto, y un usuario
 * llamado "Bot Bitrix24" o con el nombre entero en NAME no aparece nunca —
 * fallaba en silencio y las negociaciones habrían nacido sin responsable.
 */
export async function usuariosBot(): Promise<UsuarioBitrix[]> {
  const out: UsuarioBitrix[] = []
  for (let start = 0; start < 500; start += 50) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pagina: any[] = []
    try { pagina = await bitrix('user.get', { start, ADMIN_MODE: true }) } catch { break }
    if (!pagina?.length) break
    for (const u of pagina) {
      const nombre = [u.NAME, u.LAST_NAME].filter(Boolean).join(' ').trim()
      if (/bot/i.test(nombre)) {
        out.push({ id: Number(u.ID), nombre, activo: u.ACTIVE !== false && u.ACTIVE !== 'N', email: u.EMAIL ?? null })
      }
    }
    if (pagina.length < 50) break
  }
  return out
}

/** Id del usuario "Bot Bitrix", a quien se asignan las negociaciones de referidos. */
export async function usuarioBot(): Promise<number | null> {
  // El id explícito manda: es la salida cuando el nombre no se puede adivinar.
  const fijo = Number(process.env.BITRIX_BOT_USER_ID ?? '')
  if (Number.isFinite(fijo) && fijo > 0) return fijo

  if (botCache && Date.now() - botCache.at < TTL) return botCache.id
  let id: number | null = null
  try {
    const bots = await usuariosBot()
    const buscado = USUARIO_BOT.trim().toLowerCase()
    const exacto = bots.find(u => u.nombre.toLowerCase() === buscado)
    id = (exacto ?? bots.find(u => u.activo) ?? bots[0])?.id ?? null
  } catch { id = null }
  botCache = { at: Date.now(), id }
  return id
}

export interface AltaReferido {
  nombre: string; apellidos: string | null; email: string; telefono: string | null
  programa: string | null; referente: string; referenteDoc: string | null
}

/**
 * Crea el contacto y la negociación en el CRM, asignados al bot.
 *
 * Que exista en Bitrix es justamente el punto: sin eso, ese mismo prospecto
 * puede llegar por otra vía y un asesor lo trabaja sin saber que Antonella y
 * el estudiante ya están en ello.
 */
export async function crearNegociacionReferido(r: AltaReferido): Promise<{ contact_id: number; deal_id: number; embudo: string }> {
  const embudos = await embudosBGU()
  const destino = embudos.find(e => e.nombre.trim().toUpperCase() === EMBUDO_REFERIDOS.trim().toUpperCase())
  // Si el embudo no existe se falla en voz alta. Caer al "primero de la lista"
  // sería escribir en el embudo de otra campaña y que nadie se entere.
  if (!destino) throw new Error(`No existe el embudo "${EMBUDO_REFERIDOS}" en el CRM: créalo desde el diagnóstico`)
  const bot = await usuarioBot()

  const detalle = `Referido por ${r.referente}${r.referenteDoc ? ` (${r.referenteDoc})` : ''}, estudiante de Blackwell.`
    + (r.programa ? ` Interés: ${r.programa}.` : '')
    + ' Programa Free Degree — lo está atendiendo Antonella.'

  const contact_id = Number(await bitrix('crm.contact.add', {
    fields: {
      NAME: r.nombre,
      LAST_NAME: r.apellidos ?? '',
      EMAIL: [{ VALUE: r.email, VALUE_TYPE: 'WORK' }],
      ...(r.telefono ? { PHONE: [{ VALUE: r.telefono, VALUE_TYPE: 'MOBILE' }] } : {}),
      COMMENTS: detalle,
      ...(bot ? { ASSIGNED_BY_ID: bot } : {}),
      OPENED: 'Y',
    },
    params: { REGISTER_SONET_EVENT: 'N' },
  }))

  const primera = destino.etapas[0]?.status_id
  const deal_id = Number(await bitrix('crm.deal.add', {
    fields: {
      TITLE: `Free Degree · ${[r.nombre, r.apellidos].filter(Boolean).join(' ')}`,
      CONTACT_ID: contact_id,
      CATEGORY_ID: destino.id,
      ...(primera ? { STAGE_ID: primera } : {}),
      COMMENTS: detalle,
      ...(bot ? { ASSIGNED_BY_ID: bot } : {}),
      OPENED: 'Y',
    },
    params: { REGISTER_SONET_EVENT: 'N' },
  }))

  return { contact_id, deal_id, embudo: destino.nombre }
}

export const ETIQUETA_UMBRAL = ETAPA_UMBRAL

// ---------------------------------------------------------------------------
// Alta del embudo de referidos.
//
// Se crea desde aquí y no a mano en el CRM para que quede una sola definición:
// el nombre del embudo y el de la etapa umbral tienen que coincidir con lo que
// lee la regla, y dos personas escribiéndolos por separado los escriben
// distinto tarde o temprano.
//
// Es idempotente: si el embudo ya existe lo reutiliza, y si ya tiene la etapa
// umbral no la duplica.
// ---------------------------------------------------------------------------
export async function crearEmbudoReferidos(): Promise<{
  id: number; nombre: string; creado: boolean; etapa_umbral: string | null; etapas: string[]
}> {
  const existentes = await embudosBGU()
  let emb = existentes.find(e => e.nombre.trim().toUpperCase() === EMBUDO_REFERIDOS.trim().toUpperCase())
  let creado = false

  if (!emb) {
    let id: number
    try {
      const r = await bitrix('crm.category.add', { entityTypeId: 2, fields: { name: EMBUDO_REFERIDOS } })
      id = Number(r?.category?.id ?? r?.id)
    } catch {
      id = Number(await bitrix('crm.dealcategory.add', { fields: { NAME: EMBUDO_REFERIDOS, SORT: 500 } }))
    }
    if (!Number.isFinite(id)) throw new Error('El CRM no devolvió el id del embudo creado')
    creado = true
    cache = null                       // el catálogo cacheado ya no vale
    emb = (await embudosBGU()).find(e => e.id === id) ?? { id, nombre: EMBUDO_REFERIDOS, etapas: [] }
  }

  // La etapa umbral: si el embudo nació con las etapas por defecto de Bitrix,
  // no la trae, y sin ella la regla se queda solo con los 3 meses.
  const actual = emb
  let umbral = actual.etapas.find(e => e.nombre.trim().toLowerCase() === ETAPA_UMBRAL.trim().toLowerCase())?.status_id ?? null
  if (!umbral) {
    // Va antes de las etapas de cierre: es una etapa de proceso.
    const proceso = actual.etapas.filter(e => e.semantica !== 'S' && e.semantica !== 'F')
    const sort = proceso.length ? Math.round(proceso[proceso.length - 1].orden + 5) : 20
    const statusId = actual.id === 0 ? 'UC_FREEDEG' : `C${actual.id}:UC_FREEDEG`
    try {
      await bitrix('crm.status.add', {
        fields: {
          ENTITY_ID: actual.id === 0 ? 'DEAL_STAGE' : `DEAL_STAGE_${actual.id}`,
          STATUS_ID: statusId, NAME: ETAPA_UMBRAL, SORT: sort,
        },
      })
      umbral = statusId
      cache = null
    } catch (e) {
      throw new Error(`Embudo creado, pero no se pudo añadir la etapa "${ETAPA_UMBRAL}": ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const fresco = (await embudosBGU()).find(e => e.id === actual.id) ?? actual
  return { id: fresco.id, nombre: fresco.nombre, creado, etapa_umbral: umbral, etapas: fresco.etapas.map(e => e.nombre) }
}

// ---------------------------------------------------------------------------
// Vocabulario del embudo de referidos.
//
// Bitrix crea todo embudo nuevo con sus etapas por defecto —"Crear documentos",
// "Factura", "Analizar la falla"—, que no describen nada de lo que pasa con un
// referido. Peor: la etapa umbral se añade al final de las de proceso, así que
// "Buscando Decisión" quedaba DESPUÉS de "Factura final" y el corte de la regla
// caía en el sitio equivocado.
//
// Se renombran en su orden real, una a una. No se borra ninguna: renombrar no
// mueve negociaciones, borrar sí las dejaría huérfanas.
// ---------------------------------------------------------------------------
const ETAPAS_REFERIDOS = [
  'Referido nuevo',
  'Contactado',
  'En conversación',
  ETAPA_UMBRAL,          // el umbral, en su lugar lógico
  'Buscando Pago',
  'Confirmando Pago',
]

export async function ordenarEtapasReferidos(): Promise<{ renombradas: string[]; etapas: string[]; etapa_umbral: string | null }> {
  const emb = (await embudosBGU()).find(e => e.nombre.trim().toUpperCase() === EMBUDO_REFERIDOS.trim().toUpperCase())
  if (!emb) throw new Error(`No existe el embudo "${EMBUDO_REFERIDOS}"`)

  const proceso = emb.etapas.filter(e => e.semantica !== 'S' && e.semantica !== 'F').sort((a, b) => a.orden - b.orden)
  const ganada = emb.etapas.find(e => e.semantica === 'S')
  const perdida = emb.etapas.filter(e => e.semantica === 'F').sort((a, b) => a.orden - b.orden)[0]

  const renombradas: string[] = []
  const renombrar = async (et: Etapa | undefined, nombre: string) => {
    if (!et || et.nombre === nombre) return
    await bitrix('crm.status.update', { id: et.id, fields: { NAME: nombre } })
    renombradas.push(`${et.nombre} → ${nombre}`)
  }

  for (let i = 0; i < Math.min(proceso.length, ETAPAS_REFERIDOS.length); i++) {
    await renombrar(proceso[i], ETAPAS_REFERIDOS[i])
  }
  await renombrar(ganada, 'Inscrito')
  await renombrar(perdida, 'No interesado')

  cache = null
  const fresco = (await embudosBGU()).find(e => e.id === emb.id) ?? emb
  // El umbral se relee DESPUES de renombrar: al crear el embudo se informaba
  // el status_id de la etapa que entonces se llamaba asi, y el renombrado la
  // mueve de sitio. Un dato informativo que miente es peor que no darlo.
  const umbral = fresco.etapas.find(e => e.nombre.trim().toLowerCase() === ETAPA_UMBRAL.trim().toLowerCase())
  return { renombradas, etapas: fresco.etapas.map(e => e.nombre), etapa_umbral: umbral?.status_id ?? null }
}
