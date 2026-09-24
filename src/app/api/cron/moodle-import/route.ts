import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { moodleConfigured, moodleCall } from '@/lib/moodle'
import { importAula, loadStudentsByExternal, enrolledMap, CRON_ACTOR_UUID, courseTotal } from '@/lib/moodle-import'
import { resolveImportTarget, stableUuid } from '@/lib/grades-write'
import { computeGraduates } from '@/lib/graduates'
import { recomputeSituations } from '@/lib/withdrawals'
import { advanceCarousels } from '@/lib/carousel'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// Importación automática de actas Moodle (4 veces al día, vercel.json).
// Recorre todas las aulas VINCULADAS y les aplica exactamente el mismo
// pipeline que el botón manual: compuerta de política (pesos auditados = 100,
// escala 100, visible), propiedad de la fila, blindajes, actas cerradas y
// auditoría. Un aula que no cumple se reporta y se salta — nunca se fuerza.
//
// Presupuesto de tiempo: se procesan primero las aulas con la importación
// más vieja (max synced_at de sus notas); si la corrida no alcanza para
// todas, la siguiente (6 horas después) continúa donde quedó.
// ---------------------------------------------------------------------------
// No se ARRANCAN aulas nuevas pasados los 180s; las que están en vuelo pueden
// usar hasta el segundo 230 (deadline de sus llamadas WS). El margen restante
// del maxDuration=300 queda para los recálculos globales y la respuesta.
const BUDGET_MS = 180_000
const WS_DEADLINE_MS = 230_000

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!moodleConfigured()) return NextResponse.json({ error: 'Moodle no configurado' }, { status: 400 })

  const started = Date.now()
  const sb = db()

  // Aulas a importar: moodle_course_links, que es donde vive el vínculo desde
  // que se movió de la oferta formativa al plan de estudios.
  //
  // Antes esto leía semester_offerings.moodle_course_id. La migración quedó a
  // medias: las tablas nuevas, las colecciones y la pantalla se construyeron y
  // se cargaron 587 vínculos, pero el importador nunca cambió de fuente. El
  // resultado fue el peor posible — 381 aulas se veían "vinculadas" en pantalla
  // y el cron no las visitaba nunca, así que sus notas no llegaban y nada daba
  // error.
  //
  // Y se respeta sync_enabled, que hasta ahora no controlaba nada: vincular
  // declara la correspondencia, encender autoriza que las notas entren al
  // expediente. Son dos permisos distintos y el segundo tiene que poder
  // negarse.
  const { data: links } = await sb.from('moodle_course_links')
    .select('aula_id').eq('kind', 'asignatura').eq('sync_enabled', true).is('replaced_at', null)
  let aulaIds = [...new Set(((links ?? []) as { aula_id: number }[])
    .map(l => Number(l.aula_id)).filter(n => isFinite(n) && n > 0))]

  // ?aula=N importa SOLO esa aula, saltando la rotación. Para operar un caso
  // puntual (re-importar tras corregir algo) sin esperar a que la cola dé la
  // vuelta al campus. Sigue exigiendo el vínculo encendido: esto elige entre
  // las aulas autorizadas, no autoriza ninguna.
  const soloAula = Number(req.nextUrl.searchParams.get('aula') ?? NaN)
  // ?aula=N&censo=1 → SOLO diagnóstico (no importa): quiénes están matriculados
  // en el aula según Moodle, cruzados con el ERP — colección cargada, carrusel
  // (activo/completado) y programa. Para detectar estudiantes en el aula de
  // OTRA colección (24/09/2026: aula 722 con 233 matriculados en una colección
  // cuya mediana es 12).
  // ?aula=N&diag_doc=DOC → SOLO diagnóstico por estudiante (no importa): qué
  // recibe el importador de Moodle para ESA persona en ESA aula — si está
  // matriculada, si cruza el puente, qué total y qué ítems reporta el aula, y
  // qué haría resolveImportTarget con las filas que ya tiene. Nació el
  // 24/09/2026 para seis casos de "la nota no se actualiza aunque sincronice".
  // Con &escala=1 además lee el máximo del total de curso de los primeros 8
  // matriculados con puente: la política del aula juzga la escala por el
  // PRIMER reporte que llega, y en Natural ese máximo puede variar por alumno.
  if (isFinite(soloAula) && req.nextUrl.searchParams.get('diag_doc')) {
    const doc = String(req.nextUrl.searchParams.get('diag_doc'))
    const users = await enrolledMap(soloAula, 120_000)
    let activos: Set<number> | null = null
    try {
      const act = await moodleCall('core_enrol_get_enrolled_users', { courseid: soloAula, options: [{ name: 'onlyactive', value: 1 }] }, { timeoutMs: 120_000 })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      activos = new Set(((Array.isArray(act) ? act : []) as any[]).map(u => Number(u.id)))
    } catch { /* se informa null */ }
    const { data: st } = await sb.from('academic_students').select('id, first_name, last_name, document_number, external_id, moodle_user_id').eq('document_number', doc).maybeSingle()
    if (!st) return NextResponse.json({ error: 'estudiante no encontrado por documento' }, { status: 404 })
    const byExternal = await loadStudentsByExternal(sb)
    const enMoodle = [...users.entries()].find(([uid, u]) => uid === Number(st.moodle_user_id) || (u.idnumber && (u.idnumber === st.external_id || u.idnumber === st.id)))
    const out: Record<string, unknown> = {
      aula: soloAula, estudiante: `${st.first_name ?? ''} ${st.last_name ?? ''}`.trim(), documento: doc, student_id: st.id, external_id: st.external_id, moodle_user_id_erp: st.moodle_user_id,
      matriculado_en_aula: !!enMoodle, matricula_activa_en_aula: enMoodle ? (activos ? activos.has(enMoodle[0]) : null) : null,
      idnumber_moodle: enMoodle?.[1].idnumber ?? null, puente_ok: enMoodle ? byExternal.has(enMoodle[1].idnumber) : null,
    }
    const { data: link } = await sb.from('moodle_course_links').select('course_id, academic_courses(id, code, name, program_id, academic_programs(category_id))').eq('aula_id', soloAula).eq('kind', 'asignatura').is('replaced_at', null).limit(1).maybeSingle()
    const curso = link?.academic_courses ?? null
    out.asignatura = curso ? `${curso.code} · ${curso.name}` : null
    const { data: prev } = await sb.from('academic_grades').select('external_id, course_id, course_code, course_name, final_grade, retake_grade, source, intento, semester_id, edited_at, edited_by, locked_at, moodle_course_id, passing_score').eq('student_id', st.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filasAsig = ((prev ?? []) as any[]).filter(g => curso && (g.course_id === curso.id || g.course_code === curso.code))
    out.filas_de_la_asignatura_en_erp = filasAsig
    const { data: ce } = curso ? await sb.from('academic_course_enrollments').select('attempt, status, semester_id').eq('student_id', st.id).eq('course_id', curso.id) : { data: [] }
    out.inscripciones = ce ?? []
    if (enMoodle) {
      const uid = enMoodle[0]
      const r = await moodleCall('gradereport_user_get_grade_items', { courseid: soloAula, userid: uid }, { timeoutMs: 60_000 })
      const ug = r?.usergrades?.[0]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items = ((ug?.gradeitems ?? []) as any[])
      const courseItem = items.find(i => i.itemtype === 'course')
      out.reporte_moodle = {
        usergrades: r?.usergrades?.length ?? 0, items: items.length,
        total_curso: courseItem ? { graderaw: courseItem.graderaw, grademax: courseItem.grademax, gradeformatted: courseItem.gradeformatted, percentageformatted: courseItem.percentageformatted } : null,
        total_calculado: courseTotal(items),
        items_mod_con_nota: items.filter(i => i.itemtype === 'mod' && i.graderaw != null).length,
        items_mod_con_peso: items.filter(i => i.itemtype === 'mod' && (i.weightraw ?? 0) > 0).length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        primeros_items: items.filter(i => i.itemtype === 'mod').slice(0, 6).map((i: any) => ({ nombre: i.itemname, nota: i.graderaw, max: i.grademax, peso: i.weightraw, fecha: i.gradedategraded })),
      }
      let passing: number | null = null
      if (curso?.academic_programs?.category_id) {
        const { data: cat } = await sb.from('academic_programs_category').select('passing_score').eq('id', curso.academic_programs.category_id).maybeSingle()
        passing = cat?.passing_score ?? null
      }
      if (curso) {
        const total = courseTotal(items)
        out.decision_import = total == null
          ? 'sinTotal: el aula no reporta total de curso para este alumno → se salta'
          : resolveImportTarget(prev ?? [], { id: curso.id, code: curso.code, name: curso.name }, stableUuid(`moodle:${soloAula}:${uid}`), passing, { valor: total, rendido_pct: null, semester_start: null, semester_id: null }, null)
      }
    }
    if (req.nextUrl.searchParams.get('escala') === '1') {
      const conPuente = [...users.entries()].filter(([, u]) => u.idnumber && byExternal.has(u.idnumber)).slice(0, 8)
      const escalas: Record<string, unknown>[] = []
      for (const [uid, u] of conPuente) {
        try {
          const r = await moodleCall('gradereport_user_get_grade_items', { courseid: soloAula, userid: uid }, { timeoutMs: 30_000 })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ci = ((r?.usergrades?.[0]?.gradeitems ?? []) as any[]).find(i => i.itemtype === 'course')
          escalas.push({ uid, nombre: u.fullname, grademax_total: ci?.grademax ?? null, graderaw_total: ci?.graderaw ?? null })
        } catch (e) { escalas.push({ uid, error: e instanceof Error ? e.message : 'error' }) }
      }
      out.escala_primeros_8 = escalas
    }
    const { data: aud } = await sb.from('moodle_aula_audit').select('reject_since, reject_reason, escala_total, suma_coeficientes, matriculados, last_import_at, import_cursor').eq('aula_id', soloAula).maybeSingle()
    out.auditoria_aula = aud ?? null
    return NextResponse.json(out)
  }
  if (isFinite(soloAula) && req.nextUrl.searchParams.get('censo') === '1') {
    const users = await enrolledMap(soloAula, 120_000)
    // Matrículas ACTIVAS en el aula (las suspendidas por avance de carrusel no cuentan como acceso vigente)
    let activos: Set<number> | null = null
    try {
      const act = await moodleCall('core_enrol_get_enrolled_users', { courseid: soloAula, options: [{ name: 'onlyactive', value: 1 }] }, { timeoutMs: 120_000 })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      activos = new Set(((Array.isArray(act) ? act : []) as any[]).map(u => Number(u.id)))
    } catch { /* sin permiso para la opción: se informa null */ }
    const byExternal = await loadStudentsByExternal(sb)
    const { data: link } = await sb.from('moodle_course_links').select('collection_id, course_id, academic_courses(program_id, code)').eq('aula_id', soloAula).eq('kind', 'asignatura').is('replaced_at', null).limit(1).maybeSingle()
    const programId = link?.academic_courses?.program_id ?? null
    const { data: cols } = await sb.from('moodle_collections').select('id, name')
    const colName = new Map<string, string>((cols ?? []).map((c: { id: string; name: string }) => [String(c.id), c.name]))
    const sids: string[] = []
    const sinPuente: string[] = []
    for (const u of users.values()) { const st = u.idnumber ? byExternal.get(u.idnumber) : null; if (st?.id) sids.push(String(st.id)); else sinPuente.push(u.fullname) }
    const { data: enrs } = sids.length ? await sb.from('academic_student_enrollments').select('student_id, collection_id, status, program_id').in('student_id', sids) : { data: [] }
    const { data: gs } = programId ? await sb.from('academic_groups').select('id, abbreviation').eq('program_id', programId) : { data: [] }
    const gAbbr = new Map((gs ?? []).map((g: { id: string; abbreviation: string }) => [String(g.id), g.abbreviation]))
    const { data: mem } = sids.length && (gs ?? []).length ? await sb.from('academic_group_students').select('student_id, group_id, status').in('student_id', sids).in('group_id', (gs ?? []).map((g: { id: string }) => g.id)) : { data: [] }
    const porColeccion: Record<string, number> = {}, porCarrusel: Record<string, number> = {}
    const porColeccionActivos: Record<string, number> = {}
    const uidDeSid = new Map<string, number>(); for (const [uid, u] of users) { const st = u.idnumber ? byExternal.get(u.idnumber) : null; if (st?.id) uidDeSid.set(String(st.id), uid) }
    const ejemplosOtraCol: string[] = []
    const detalle = req.nextUrl.searchParams.get('detalle') === '1'
    const cruzados: Record<string, unknown>[] = []
    const colAula = link?.collection_id ? colName.get(String(link.collection_id)) : null
    for (const sid of sids) {
      const e = (enrs ?? []).filter((x: { student_id: string; program_id: string | null }) => x.student_id === sid && (!programId || x.program_id === programId))
      const c: string = e[0]?.collection_id ? String(colName.get(String(e[0].collection_id)) ?? 'otra') : (e.length ? 'sin colección' : 'sin matrícula en este programa')
      porColeccion[c] = (porColeccion[c] ?? 0) + 1
      if (activos && activos.has(uidDeSid.get(sid) ?? -1)) porColeccionActivos[c] = (porColeccionActivos[c] ?? 0) + 1
      const ms = (mem ?? []).filter((m: { student_id: string }) => m.student_id === sid)
      const k = ms.length ? ms.map((m: { group_id: string; status: string }) => `${gAbbr.get(String(m.group_id))}:${m.status}`).sort().join('+') : 'sin carrusel'
      porCarrusel[k] = (porCarrusel[k] ?? 0) + 1
      if (colAula && c !== colAula && c !== 'sin colección' && ejemplosOtraCol.length < 10) { const st = [...byExternal.values()].find((x: { id: string }) => String(x.id) === sid); ejemplosOtraCol.push(`${st?.first_name ?? ''} ${st?.last_name ?? ''} (${c})`) }
      if (detalle && colAula && c !== colAula && activos && activos.has(uidDeSid.get(sid) ?? -1)) {
        const st = [...byExternal.values()].find((x: { id: string }) => String(x.id) === sid)
        cruzados.push({ student_id: sid, moodle_user_id: uidDeSid.get(sid), documento: st?.document_number ?? null, nombre: `${st?.first_name ?? ''} ${st?.last_name ?? ''}`.trim(), coleccion_cargada: c, matricula_status: e[0]?.status ?? null, carrusel: k })
      }
    }
    return NextResponse.json({ aula: soloAula, asignatura: link?.academic_courses?.code ?? null, coleccion_del_aula: colAula, matriculados_moodle: users.size, matriculas_activas_en_aula: activos ? activos.size : null, activos_por_coleccion_cargada: activos ? porColeccionActivos : null, con_puente: sids.length, sin_puente: sinPuente.length, ejemplos_sin_puente: sinPuente.slice(0, 5), por_coleccion_cargada: porColeccion, por_carrusel: porCarrusel, ejemplos_otra_coleccion: ejemplosOtraCol, ...(detalle ? { cruzados_activos: cruzados, activos_moodle_ids: activos ? [...activos] : null } : {}) })
  }
  if (isFinite(soloAula)) {
    if (!aulaIds.includes(soloAula)) {
      return NextResponse.json({ error: `El aula ${soloAula} no está vinculada con la sincronización encendida.` }, { status: 400 })
    }
    aulaIds = [soloAula]
  }

  if (!aulaIds.length) {
    return NextResponse.json({
      ok: true, aulas: 0,
      nota: 'Ningún aula tiene la sincronización encendida. Se vinculan en Colecciones y se encienden ahí mismo.',
    })
  }

  // Rotación justa: cada intento deja huella en moodle_aula_audit.last_import_at
  // (con o sin cambios, aceptado o rechazado) y se procesa primero lo menos
  // reciente. Así ninguna aula lenta acapara las corridas.
  const { data: marks } = await sb.from('moodle_aula_audit')
    .select('aula_id, last_import_at').in('aula_id', aulaIds)
  const lastImport = new Map<number, string>(((marks ?? []) as { aula_id: number; last_import_at: string | null }[])
    .filter(m => m.last_import_at).map(m => [Number(m.aula_id), String(m.last_import_at)]))
  aulaIds.sort((a, b) => (lastImport.get(a) ?? '').localeCompare(lastImport.get(b) ?? ''))

  // Catálogo de estudiantes una sola vez para toda la corrida
  const byExternal = await loadStudentsByExternal(sb)

  let inserted = 0, updated = 0, unchanged = 0
  const importadas: Record<string, unknown>[] = []
  const rechazadas: Record<string, unknown>[] = []
  const errores: Record<string, unknown>[] = []
  const pendientes: number[] = []

  const marcar = async (id: number) => {
    await sb.from('moodle_aula_audit')
      .update({ last_import_at: new Date().toISOString() }).eq('aula_id', id)
  }

  const procesar = async (id: number) => {
    try {
      const r = await importAula(sb, id, CRON_ACTOR_UUID, { byExternal, deadlineMs: started + WS_DEADLINE_MS })
      if (!r.ok) { rechazadas.push({ aula: id, motivo: r.error }); return }
      const s = r.summary
      inserted += s.inserted; updated += s.updated; unchanged += s.unchanged
      if (s.errors?.length) errores.push({ aula: id, errores: s.errors })
      importadas.push({
        aula: id, nuevas: s.inserted, actualizadas: s.updated, sin_cambio: s.unchanged,
        protegidas: s.protected_rows, cerradas: s.locked_rows, detalles: s.detalles_escritos,
        // Aula grande que no cupo entera: se importó lo consultado y el cursor
        // continúa en la próxima corrida.
        ...(s.parcial ? { parcial: s.parcial } : {}),
      })
    } catch (e) {
      errores.push({ aula: id, errores: [String(e)] })
    } finally {
      try { await marcar(id) } catch { /* la rotación tolera huecos */ }
    }
  }

  // Pool de 3 trabajadores: el cuello es la latencia del WS de Moodle, no la
  // base — tres reportes en vuelo triplican el avance sin castigar al campus.
  let cursor = 0
  const worker = async () => {
    while (cursor < aulaIds.length) {
      if (Date.now() - started > BUDGET_MS) break
      const id = aulaIds[cursor++]
      await procesar(id)
    }
  }
  await Promise.all([worker(), worker(), worker()])
  pendientes.push(...aulaIds.slice(cursor))

  // Efectos globales una sola vez si algo cambió
  let recompute: Record<string, unknown> | null = null
  if (inserted + updated > 0) {
    try {
      const graduates = await computeGraduates(sb)
      const situations = await recomputeSituations(sb)
      const carousels = await advanceCarousels(sb)
      recompute = {
        egresados_detectados: graduates.graduates,
        situaciones_actualizadas: situations.updated,
        avances_de_carrusel: carousels.advanced.length,
      }
    } catch (e) {
      recompute = { error: 'Recalculo pendiente (los crons nocturnos convergen): ' + String(e) }
    }
  }

  return NextResponse.json({
    ok: true,
    aulas_vinculadas: aulaIds.length,
    procesadas: importadas.length,
    rechazadas_por_politica: rechazadas.length,
    con_errores: errores.length,
    pendientes_proxima_corrida: pendientes.length,
    nuevas: inserted, actualizadas: updated, sin_cambio: unchanged,
    detalle: { importadas, rechazadas, errores, pendientes },
    recompute,
    duracion_s: Math.round((Date.now() - started) / 1000),
  })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
