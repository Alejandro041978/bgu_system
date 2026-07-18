import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { moodleCall, moodleConfigured } from '@/lib/moodle'

export const maxDuration = 120
export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Reconocimiento de Moodle para la integración de actas (Fase 3). Cada sonda va
// en try/catch propio: el token puede tener funciones de menos y queremos el
// mapa completo de lo que SÍ permite. Muestrea aulas desde
// semester_offerings.moodle_course_id (ya vinculadas por el aprovisionamiento
// de grupos) para no depender del listado global de cursos.
// Devuelve conteos y estructura, nunca listas de datos personales.
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!moodleConfigured()) {
    return NextResponse.json({ error: 'Faltan MOODLE_URL / MOODLE_WS_TOKEN' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Record<string, any> = {}
  const probe = async (name: string, fn: () => Promise<unknown>) => {
    try { out[name] = await fn() } catch (e) { out[name] = { error: e instanceof Error ? e.message : String(e) } }
  }

  await probe('site', async () => {
    const info = await moodleCall('core_webservice_get_site_info', {})
    return {
      sitename: info?.sitename, release: info?.release,
      funciones_del_token: ((info?.functions ?? []) as { name: string }[]).map(f => f.name).sort(),
    }
  })

  const sb = db()

  // Aulas ya vinculadas por el aprovisionamiento de grupos
  const { data: offs } = await sb.from('semester_offerings')
    .select('id, moodle_course_id').not('moodle_course_id', 'is', null).limit(20)
  const courseIds = [...new Set(((offs ?? []) as { moodle_course_id: string }[])
    .map(o => Number(o.moodle_course_id)).filter(n => isFinite(n) && n > 0))]
  out.aulas_vinculadas_en_erp = courseIds.length

  // Padrón nuestro para medir el cruce
  const studs: { document_number: string | null; email: string | null }[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('academic_students').select('document_number, email').range(from, from + 999)
    const rows = data ?? []
    studs.push(...rows)
    if (rows.length < 1000) break
  }
  const ourEmails = new Set(studs.map(s => (s.email ?? '').toLowerCase().trim()).filter(Boolean))
  const ourDocs = new Set(studs.map(s => String(s.document_number ?? '').trim()).filter(Boolean))

  let usuarios = 0, conEmail = 0, conIdnumber = 0, emailCruza = 0, idnumberCruza = 0
  const dominios = new Map<string, number>()
  const idnFormas = { uuid: 0, solo_digitos: 0, otro: 0 }
  const idnMuestra = new Set<string>()
  let localpartNombreApellido = 0
  const aulas: { courseid: number; nombre?: string; matriculados: number }[] = []
  for (const cid of courseIds.slice(0, 5)) {
    try {
      const enrolled = await moodleCall('core_enrol_get_enrolled_users', { courseid: cid })
      const users = (Array.isArray(enrolled) ? enrolled : []) as { email?: string; idnumber?: string }[]
      let nombre: string | undefined
      try {
        const cf = await moodleCall('core_course_get_courses_by_field', { field: 'id', value: String(cid) })
        nombre = cf?.courses?.[0] ? `${cf.courses[0].shortname} · ${cf.courses[0].fullname}` : undefined
      } catch { /* sin permiso, no importa */ }
      aulas.push({ courseid: cid, nombre, matriculados: users.length })
      for (const u of users) {
        usuarios++
        const em = (u.email ?? '').toLowerCase().trim()
        const idn = String(u.idnumber ?? '').trim()
        if (em) {
          conEmail++
          const dom = em.split('@')[1] ?? '?'
          dominios.set(dom, (dominios.get(dom) ?? 0) + 1)
          if (ourEmails.has(em)) emailCruza++
          if (/^[a-z]+\.[a-z]+@/.test(em)) localpartNombreApellido++
        }
        if (idn) {
          conIdnumber++
          if (ourDocs.has(idn)) idnumberCruza++
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idn)) idnFormas.uuid++
          else if (/^\d+$/.test(idn)) idnFormas.solo_digitos++
          else idnFormas.otro++
          // Muestra enmascarada: forma sin identidad (3 chars + largo)
          if (idnMuestra.size < 5) idnMuestra.add(idn.slice(0, 3) + '…(' + idn.length + ' chars)')
        }
      }
    } catch (e) {
      aulas.push({ courseid: cid, matriculados: -1 })
      out.error_enrolled = e instanceof Error ? e.message : String(e)
    }
  }
  out.identificacion = {
    aulas_muestreadas: aulas,
    usuarios_vistos: usuarios,
    con_email: conEmail,
    con_idnumber: conIdnumber,
    cruzan_por_email_con_academic_students: emailCruza,
    cruzan_por_idnumber_con_documento: idnumberCruza,
    dominios_de_correo: Object.fromEntries([...dominios.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)),
    idnumber_formas: idnFormas,
    idnumber_muestra_enmascarada: [...idnMuestra],
    correos_con_forma_nombre_punto_apellido: localpartNombreApellido,
  }

  // Exploración: ¿alguna aula tiene calificaciones visibles? Distingue entre
  // "el token no puede ver notas" (todas en cero) y "esta aula fue limpiada"
  // (otras aulas sí muestran valores).
  await probe('exploracion_notas', async () => {
    const courses = await moodleCall('core_course_get_courses', {})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = ((Array.isArray(courses) ? courses : []) as any[]).filter(c => c.format !== 'site')
    const resultados: Record<string, unknown>[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ejemplo: any = null
    let conValores = 0, vacias = 0, revisadas = 0
    for (const c of list.slice(0, 80)) {
      if (revisadas >= 20 || conValores >= 2) break
      try {
        const rep = await moodleCall('gradereport_user_get_grade_items', { courseid: c.id })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ugs = (rep?.usergrades ?? []) as any[]
        if (!ugs.length) { vacias++; continue }
        revisadas++
        let valores = 0
        for (const ug of ugs.slice(0, 60)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const i of (ug.gradeitems ?? []) as any[]) {
            if (i.graderaw != null || (i.gradeformatted && i.gradeformatted !== '-' && i.gradeformatted !== '')) {
              valores++
              if (!ejemplo) ejemplo = { aula: c.shortname, item: i }
            }
          }
        }
        if (valores > 0) conValores++
        resultados.push({ id: c.id, shortname: String(c.shortname).slice(0, 40), alumnos: ugs.length, items_con_valor: valores })
      } catch (e) {
        resultados.push({ id: c.id, shortname: String(c.shortname).slice(0, 40), error: e instanceof Error ? e.message.slice(0, 60) : 'error' })
      }
    }
    return { aulas_vacias_saltadas: vacias, aulas_revisadas: resultados, ejemplo_item_con_valor: ejemplo }
  })

  // ?idnumbers=a,b,c → ¿existen usuarios de Moodle con esos idnumber?
  // Sirve para confirmar que idnumber = Users.Id de SystemActiva: se pasan
  // UUIDs conocidos y se cuenta cuántos devuelve Moodle. Sin datos personales.
  const idnParam = req.nextUrl.searchParams.get('idnumbers')
  if (idnParam) {
    await probe('sonda_idnumber', async () => {
      const values = idnParam.split(',').map(s => s.trim()).filter(Boolean).slice(0, 20)
      const users = await moodleCall('core_user_get_users_by_field', { field: 'idnumber', values })
      const found = (Array.isArray(users) ? users : []) as { idnumber?: string; email?: string }[]
      return {
        consultados: values.length,
        encontrados: found.length,
        dominios: found.map(u => (u.email ?? '').split('@')[1] ?? '?'),
      }
    })
  }

  // Notas: probar el reporte de calificaciones en la primera aula con alumnos
  const target = aulas.find(a => a.matriculados > 0)
  if (target) {
    await probe('grade_items', async () => {
      const rep = await moodleCall('gradereport_user_get_grade_items', { courseid: target.courseid })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const usergrades = (rep?.usergrades ?? []) as any[]
      // Ítems CRUDOS del primer alumno, sin condiciones: ver qué campos llegan
      const first = usergrades[0]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const totalItem = first?.gradeitems?.find((i: any) => i.itemtype === 'course') ?? null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const modConAlgo = first?.gradeitems?.find((i: any) => i.itemtype === 'mod' && (i.graderaw != null || (i.gradeformatted && i.gradeformatted !== '-'))) ?? null
      let conRaw = 0, conFormatted = 0
      for (const ug of usergrades) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const t = (ug.gradeitems ?? []).find((i: any) => i.itemtype === 'course')
        if (t?.graderaw != null) conRaw++
        if (t?.gradeformatted && t.gradeformatted !== '-') conFormatted++
      }
      return {
        courseid: target.courseid,
        alumnos_en_reporte: usergrades.length,
        totales_con_graderaw: conRaw,
        totales_con_gradeformatted: conFormatted,
        item_total_crudo_primer_alumno: totalItem,
        item_mod_crudo_primer_alumno: modConAlgo,
      }
    })
    // Alternativa si la anterior no está permitida
    await probe('grades_table_alt', async () => {
      const rep = await moodleCall('gradereport_user_get_grades_table', { courseid: target.courseid })
      return { disponible: !!rep, tablas: Array.isArray(rep?.tables) ? rep.tables.length : 0 }
    })
  }

  return NextResponse.json(out)
}
