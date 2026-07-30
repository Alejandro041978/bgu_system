import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { moodleCall, moodleConfigured, MOODLE_STUDENT_ROLEID } from '@/lib/moodle'
import { randomBytes } from 'crypto'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// Auditor del Campus — auditoría ESTRUCTURAL del aula, independiente de
// estudiantes y calificaciones: recursos, cuáles son evaluados, cuáles están
// activos (visibles) y sus ponderaciones. Política: las ponderaciones de
// primer nivel de los recursos evaluados ACTIVOS suman 100% y el total del
// curso está en escala sobre 100. Los recursos ocultos no cuentan.
//
// Moodle solo expone las ponderaciones a través del reporte de un usuario
// matriculado. Para aulas con matriculados se usa el primero; para aulas
// vacías, la cuenta de servicio "Auditor ERP" se matricula un instante, lee la
// estructura y se desmatricula.
//
// GET  → última foto guardada + resumen
// POST → barre Moodle aula por aula y guarda la foto (toma 1-3 minutos)
export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = db()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('moodle_aula_audit').select('*').order('shortname').range(from, from + 999)
    if (error) return NextResponse.json({ error: 'Falta correr supabase/moodle_audit.sql: ' + error.message }, { status: 400 })
    const chunk = data ?? []
    rows.push(...chunk)
    if (chunk.length < 1000) break
  }
  // Pesos: DOS señales complementarias y AMBAS deben cumplir.
  //  - suma_coeficientes (BD de Moodle, ítems VISIBLES): detecta huecos que la
  //    normalización esconde (3 Module Tests de 4 → 95)… pero es CIEGA al peso
  //    FANTASMA (ítems ocultos con coeficiente > 0 que diluyen la nota).
  //  - suma_pesos (WS, weightraw de ítems activos): detecta la dilución (los
  //    visibles pesan <100 porque los ocultos roban)… pero viene null si el
  //    lector no expone pesos. Caso 2026-07-28: 130 aulas con 5,781 pts de coef
  //    oculto pasaron como "cumple" porque la aritmética (100 visible) mandaba
  //    y silenciaba el 43-62% que el WS sí reportaba.
  // ⚠ La Σ aritmética viene de OTRA tubería (N8N → /api/sync/moodle-coefs) y
  // puede quedar CADUCADA respecto de la auditoría. Pasó el 30-07: se
  // normalizó Update en Moodle, se auditó, y las 48 salieron "incumplen"
  // porque `suma_coeficientes` seguía con el 12 sincronizado el 23-07. Un
  // número viejo no puede tumbar una medición nueva: si el sync es anterior a
  // la auditoría, esa señal se ignora y manda la del webservice.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const coefVigente = (r: any): boolean =>
    r.suma_coeficientes != null && !!r.coefs_sync_at &&
    (!r.audited_at || new Date(r.coefs_sync_at) >= new Date(r.audited_at))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cumplePesosDe = (r: any): boolean | null => {
    const okCoef = coefVigente(r) ? Math.abs(Number(r.suma_coeficientes) - 100) <= 0.5 : null
    const okWS = r.cumple_pesos ?? null
    if (okCoef === false || okWS === false) return false
    if (okCoef == null && okWS == null) return null
    return true
  }
  // Cada aula vive en EXACTAMENTE una categoría (suman el total), por esta
  // precedencia: sin datos > sin evaluaciones > incumple (viola algo medible)
  // > cumple > sin ponderación reportada (no reporta pesos y nada más falla).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const estadoDe = (r: any): string => {
    if (r.error) return 'sin_datos'
    if ((r.items_evaluacion ?? 0) === 0) return 'sin_evaluaciones'
    const cp = cumplePesosDe(r)
    if (cp === false || r.cumple_escala === false) return 'incumplen'
    if (cp === true && r.cumple_escala === true) return 'cumplen'
    return 'sin_ponderacion'
  }
  const porEstado = new Map<string, number>()
  for (const r of rows) porEstado.set(estadoDe(r), (porEstado.get(estadoDe(r)) ?? 0) + 1)

  // Resumen por FAMILIA (la categoría padre de Moodle). Con la auditoría
  // partida por categorías, la foto deja de ser homogénea: cada familia tiene su
  // propia antigüedad. Sin esto, un "última auditoría" global mentiría — que es
  // justo lo que pasó el 30-07, cuando analicé datos de dos horas antes.
  // Dos niveles: la familia (lo que se ve en la portada de Moodle) y sus
  // subcategorías directas. Una familia como DCE puede ser demasiado grande
  // para una corrida, mientras que "Update Certificate (3 months)" es la
  // unidad real de trabajo. Como el filtro del POST compara por prefijo de la
  // ruta, ambos niveles funcionan sin lógica extra.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const familias = new Map<string, any>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const acumular = (ruta: string, nivel: number, r: any) => {
    if (!familias.has(ruta)) {
      familias.set(ruta, {
        ruta, nivel, nombre: ruta.split(' / ').pop(), aulas: 0, incumplen: 0,
        sin_matricula_manual: 0, sin_datos: 0, audited_at: null as string | null, mas_antigua: null as string | null,
      })
    }
    const f = familias.get(ruta)
    f.aulas++
    const est = estadoDe(r)
    if (est === 'incumplen') f.incumplen++
    if (est === 'sin_datos') f.sin_datos++
    if (r.manual_enrol === false) f.sin_matricula_manual++
    if (r.audited_at) {
      if (!f.audited_at || r.audited_at > f.audited_at) f.audited_at = r.audited_at
      if (!f.mas_antigua || r.audited_at < f.mas_antigua) f.mas_antigua = r.audited_at
    }
  }
  for (const r of rows) {
    // `familia` puede venir nula en filas auditadas antes de este cambio: se
    // cae a la ruta guardada para no dejarlas fuera del resumen.
    const partes = String(r.categoria ?? '(sin categoría)').split(' / ')
    const raiz = r.familia ?? partes[0]
    acumular(raiz, 1, r)
    if (partes.length > 1 && partes[0] === raiz) acumular(`${raiz} / ${partes[1]}`, 2, r)
  }

  const fechas = rows.map(r => r.audited_at).filter(Boolean).sort()
  return NextResponse.json({
    // La MÁS ANTIGUA, no la primera fila: con auditorías parciales, lo que
    // importa es qué tan vieja es la parte más rezagada de la foto.
    audited_at: fechas[fechas.length - 1] ?? null,
    audited_at_mas_antigua: fechas[0] ?? null,
    familias: [...familias.values()].sort((a, b) => String(a.ruta).localeCompare(String(b.ruta))),
    moodle_url: process.env.MOODLE_URL ?? null,
    total: rows.length,
    cumplen: porEstado.get('cumplen') ?? 0,
    incumplen: porEstado.get('incumplen') ?? 0,
    pesos_mal: rows.filter(r => cumplePesosDe(r) === false).length,
    con_suma_aritmetica: rows.filter(r => coefVigente(r)).length,
    // Aulas cuya Σ aritmética quedó vieja: su señal no se está usando, y hay
    // que volver a correr el sync de N8N para recuperarla.
    coefs_caducados: rows.filter(r => r.suma_coeficientes != null && !coefVigente(r)).length,
    escala_mal: rows.filter(r => r.cumple_escala === false).length,
    sin_evaluaciones: porEstado.get('sin_evaluaciones') ?? 0,
    sin_ponderacion: porEstado.get('sin_ponderacion') ?? 0,
    sin_datos: porEstado.get('sin_datos') ?? 0,
    vinculadas: rows.filter(r => r.linked_course).length,
    // Aulas donde el ERP NO puede matricular: sin este dato, el síntoma era una
    // importación que devolvía cero alumnos sin quejarse.
    sin_matricula_manual: rows.filter(r => r.manual_enrol === false).length,
    aulas: rows,
  })
}

const AUDITOR_USERNAME = 'erp-auditor'

// Cuenta de servicio para leer la estructura de aulas sin matriculados.
// Se crea una sola vez; no tiene sesión ni recibe correos.
async function ensureAuditorUser(): Promise<number> {
  const found = await moodleCall('core_user_get_users_by_field', { field: 'username', values: [AUDITOR_USERNAME] })
  if (Array.isArray(found) && found.length) return Number(found[0].id)
  const created = await moodleCall('core_user_create_users', {
    users: [{
      username: AUDITOR_USERNAME,
      password: 'Aud!' + randomBytes(18).toString('base64url'),
      firstname: 'Auditor',
      lastname: 'ERP',
      email: 'auditor.erp@blackwell.university',
      idnumber: 'ERP-AUDITOR',
    }],
  })
  return Number(created?.[0]?.id)
}

// POST { familia? } → audita el campus. Con `familia`, solo esa categoría de
// Moodle (y sus hijas).
//
// Barrer las 678 aulas de una vez roza el maxDuration de Vercel y a veces muere
// a medio camino. Partido por familia son decenas de aulas por corrida: termina
// rápido, y permite priorizar las categorías que se están trabajando en vez de
// pagar el barrido completo cada vez. Como el guardado es por tandas, una
// corrida parcial NO borra lo auditado de las demás familias.
export async function POST(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!moodleConfigured()) return NextResponse.json({ error: 'Moodle no configurado' }, { status: 400 })
  const sb = db()

  const body = await req.json().catch(() => null) as { familia?: string } | null
  const familia = body?.familia?.trim() || null

  const courses = await moodleCall('core_course_get_courses', {})
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let aulas = ((Array.isArray(courses) ? courses : []) as any[]).filter(c => c.format !== 'site')

  let auditorId: number | null = null
  try { auditorId = await ensureAuditorUser() } catch { /* sin cuenta de servicio: aulas vacías quedarán sin datos */ }

  // Categorías de Moodle (para agrupar el reporte). Si la función no está
  // habilitada en el servicio, se agrupa como "(sin categoría)".
  // Ruta COMPLETA desde la raíz, no "padre / hija": el árbol de Moodle tiene
  // tres niveles (DCE → Update Certificate → PPA en X) y subir uno solo hacía
  // pasar por familia a una categoría intermedia.
  const catName = new Map<number, string>()   // ruta completa
  const catRoot = new Map<number, string>()   // categoría de primer nivel
  try {
    const cats = await moodleCall('core_course_get_categories', {})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byId = new Map<number, any>(((Array.isArray(cats) ? cats : []) as any[]).map(c => [Number(c.id), c]))
    for (const [id, c] of byId) {
      // Moodle da `path` como "/1/5/23": la cadena de ancestros por id. Si no
      // viniera, se camina `parent` (con tope, por si hubiera un ciclo).
      let ids: number[]
      if (typeof c.path === 'string' && c.path.includes('/')) {
        ids = c.path.split('/').filter(Boolean).map(Number)
      } else {
        ids = []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let cur: any = c
        for (let i = 0; cur && i < 10; i++) { ids.unshift(Number(cur.id)); cur = cur.parent ? byId.get(Number(cur.parent)) : null }
      }
      const nombres = ids.map(x => byId.get(x)?.name).filter(Boolean) as string[]
      if (!nombres.length) { catName.set(id, c.name); catRoot.set(id, c.name); continue }
      catName.set(id, nombres.join(' / '))
      catRoot.set(id, nombres[0])
    }
  } catch { /* función no habilitada */ }

  // El filtro se aplica sobre la etiqueta resuelta ("Padre / Hija"), así que
  // `familia` sirve tanto para una familia entera como para una categoría hija
  // concreta: en ambos casos basta con que la etiqueta empiece por el texto.
  if (familia) {
    aulas = aulas.filter(c => String(catName.get(Number(c.categoryid)) ?? '').startsWith(familia))
    if (!aulas.length) {
      return NextResponse.json({ error: `No hay aulas en la categoría "${familia}"` }, { status: 404 })
    }
  }

  // Vínculos aula → asignatura del ERP
  const { data: offs } = await sb.from('semester_offerings')
    .select('moodle_course_id, course:academic_courses(code, name)').not('moodle_course_id', 'is', null)
  const linkedBy = new Map<number, string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of (offs ?? []) as any[]) {
    if (o.course) linkedBy.set(Number(o.moodle_course_id), `${o.course.code ?? ''} · ${o.course.name ?? ''}`)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const auditOne = async (c: any): Promise<Record<string, unknown>> => {
    const base = {
      aula_id: c.id, shortname: c.shortname, fullname: c.fullname,
      visible: c.visible !== 0, linked_course: linkedBy.get(Number(c.id)) ?? null,
      categoria: catName.get(Number(c.categoryid)) ?? null,
      familia: catRoot.get(Number(c.categoryid)) ?? null,
      audited_at: new Date().toISOString(),
    }
    const vacio = {
      recursos: null, recursos_activos: null, items_evaluacion: null, items_activos: null,
      items_con_peso: null, suma_pesos: null, escala_total: null, cumple_pesos: null, cumple_escala: null,
      enrol_methods: null, manual_enrol: null, matriculados: null,
    }

    // Métodos de matriculación del aula. Va FUERA del try principal porque es
    // el dato que explica los fallos de los demás: si el ERP no puede
    // matricular, el aula se queda sin alumnos y todo lo que dependa de leer
    // notas devuelve vacío sin error.
    let enrolMethods: string | null = null
    let manualEnrol: boolean | null = null
    try {
      const ms = await moodleCall('core_enrol_get_course_enrolment_methods', { courseid: c.id })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const arr = (Array.isArray(ms) ? ms : []) as any[]
      enrolMethods = arr.map(m => `${m.type}:${m.status ? 'activo' : 'inactivo'}`).join(', ') || 'ninguno'
      // Moodle marca `status` true cuando el método está habilitado.
      manualEnrol = arr.some(m => m.type === 'manual' && m.status)
    } catch { /* función no habilitada en el servicio: queda null, no false */ }

    // Cuántos estudiantes hay realmente. Un aula con 0 y estudiantes esperando
    // es el síntoma que hasta ahora pasaba desapercibido.
    let matriculados: number | null = null
    try {
      const todos = await moodleCall('core_enrol_get_enrolled_users', { courseid: c.id })
      matriculados = Array.isArray(todos) ? todos.length : null
    } catch { /* sin permiso para listar: queda null */ }

    try {
      // Contenido del aula: módulos y su visibilidad (activo = visible).
      // Si la función no está habilitada en el servicio, queda null (se
      // muestra "—", nunca un 0/0 engañoso).
      let recursos: number | null = null, recursosActivos: number | null = null
      const visibleByCmid = new Map<number, boolean>()
      try {
        const contents = await moodleCall('core_course_get_contents', { courseid: c.id })
        recursos = 0; recursosActivos = 0
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const sec of (Array.isArray(contents) ? contents : []) as any[]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const m of (sec.modules ?? []) as any[]) {
            recursos++
            const activo = (m.visible ?? 1) !== 0
            if (activo) recursosActivos++
            visibleByCmid.set(Number(m.id), activo)
          }
        }
      } catch { /* función no habilitada o aula sin contenido expuesto */ }

      // Lector de estructura: primer matriculado, o la cuenta Auditor ERP
      const enrolled = await moodleCall('core_enrol_get_enrolled_users', {
        courseid: c.id, options: [{ name: 'limitnumber', value: 1 }],
      })
      let readerId: number | null = Array.isArray(enrolled) && enrolled.length ? Number(enrolled[0].id) : null
      let metodo = 'alumno'
      let desmatricular = false
      if (!readerId) {
        if (!auditorId) return { ...base, ...vacio, enrol_methods: enrolMethods, manual_enrol: manualEnrol, matriculados, recursos, recursos_activos: recursosActivos, metodo: null, error: manualEnrol === false ? "el aula no tiene matriculación manual habilitada: el ERP no puede matricular" : "aula vacía y sin cuenta de servicio" }
        await moodleCall('enrol_manual_enrol_users', { enrolments: [{ roleid: MOODLE_STUDENT_ROLEID, userid: auditorId, courseid: c.id }] })
        readerId = auditorId
        metodo = 'auditor'
        desmatricular = true
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let items: any[] = []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let courseItem: any = null
      try {
        const rep = await moodleCall('gradereport_user_get_grade_items', { courseid: c.id, userid: readerId })
        items = rep?.usergrades?.[0]?.gradeitems ?? []
        courseItem = items.find(i => i.itemtype === 'course') ?? null
      } finally {
        if (desmatricular) {
          try { await moodleCall('enrol_manual_unenrol_users', { enrolments: [{ userid: readerId, courseid: c.id }] }) } catch { /* best effort */ }
        }
      }

      const rootId = courseItem?.iteminstance ?? null
      // Activo = su módulo es visible (los ítems sin cmid — categorías, manuales — se consideran activos)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const esActivo = (i: any) => i.cmid == null || (visibleByCmid.get(Number(i.cmid)) ?? true)
      const mods = items.filter(i => i.itemtype === 'mod')
      const modsActivos = mods.filter(esActivo)
      const conPeso = modsActivos.filter(i => (i.weightraw ?? 0) > 0)
      // Política: primer nivel (cuelga directo del curso), solo ACTIVOS
      const topLevel = items.filter(i => i.itemtype !== 'course' && i.categoryid === rootId && esActivo(i))
      // Si NINGÚN ítem reporta ponderación, el aula no usa (o no expone) pesos
      // — p. ej. agregación por media simple. Eso es "sin ponderación
      // reportada", un estado a investigar, NO un incumplimiento al 0%.
      const reportanPeso = topLevel.filter(i => i.weightraw != null)
      const sumaPesos = topLevel.length && reportanPeso.length
        ? Math.round(topLevel.reduce((s, i) => s + (Number(i.weightraw) || 0), 0) * 10000) / 100
        : null
      const escala = courseItem?.grademax != null ? Number(courseItem.grademax) : null
      // Un aula sin evaluaciones (encuestas, informativas) queda fuera de la
      // política: no se le exige ni suma ni escala.
      const sinEvaluaciones = mods.length === 0
      return {
        ...base,
        recursos, recursos_activos: recursosActivos,
        items_evaluacion: mods.length,
        items_activos: modsActivos.length,
        items_con_peso: conPeso.length,
        suma_pesos: sumaPesos,
        escala_total: escala,
        cumple_pesos: sinEvaluaciones ? null : (sumaPesos == null ? null : Math.abs(sumaPesos - 100) <= 0.5),
        cumple_escala: sinEvaluaciones ? null : (escala == null ? null : escala === 100),
        enrol_methods: enrolMethods, manual_enrol: manualEnrol, matriculados,
        metodo, error: manualEnrol === false ? "sin matriculación manual: el ERP no puede matricular aquí" : null,
      }
    } catch (e) {
      return { ...base, ...vacio, enrol_methods: enrolMethods, manual_enrol: manualEnrol, matriculados, metodo: null, error: e instanceof Error ? e.message.slice(0, 120) : 'error' }
    }
  }

  // En tandas para no exceder el tiempo. Cada tanda se guarda apenas sale:
  // si la función muere en el límite de Vercel (maxDuration), queda la foto
  // parcial y el siguiente intento retoma en vez de perderlo todo.
  let auditadas = 0
  for (let i = 0; i < aulas.length; i += 6) {
    const tanda = await Promise.all(aulas.slice(i, i + 6).map(auditOne))
    const { error } = await sb.from('moodle_aula_audit').upsert(tanda, { onConflict: 'aula_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    auditadas += tanda.length
  }

  return NextResponse.json({ ok: true, auditadas, familia: familia ?? 'todas' })
}
