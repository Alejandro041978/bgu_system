import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { moodleCall, moodleConfigured } from '@/lib/moodle'

export const maxDuration = 120
export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Reconocimiento de Moodle para la integración de actas (Fase 3):
//   - qué funciones permite el token (¿podemos leer calificaciones?)
//   - cómo están identificados los alumnos en las aulas (email / idnumber)
//   - cuánto cruzan contra academic_students (por correo y por documento)
//   - qué forma tienen los grade items de un aula real
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
  try {
    const info = await moodleCall('core_webservice_get_site_info', {})
    const fns = new Set<string>((info?.functions ?? []).map((f: { name: string }) => f.name))
    out.site = {
      sitename: info?.sitename, release: info?.release,
      functions_total: fns.size,
      puede_leer_notas: fns.has('gradereport_user_get_grade_items'),
      puede_leer_matriculados: fns.has('core_enrol_get_enrolled_users'),
      puede_listar_cursos: fns.has('core_course_get_courses') || fns.has('core_course_get_courses_by_field'),
    }

    const courses = await moodleCall('core_course_get_courses', {})
    const list = (Array.isArray(courses) ? courses : []).filter((c: { format?: string }) => c.format !== 'site')
    out.cursos = {
      total: list.length,
      muestra: list.slice(0, 12).map((c: { id: number; shortname: string; fullname: string; visible?: number }) =>
        ({ id: c.id, shortname: c.shortname, fullname: c.fullname, visible: c.visible })),
    }

    // Identificación de alumnos: recorrer aulas hasta juntar una muestra de usuarios
    const sb = db()
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
    const aulasMuestreadas: { id: number; shortname: string; matriculados: number }[] = []
    let gradeItemsSample: { itemname: string | null; itemtype: string; itemmodule: string | null; grademax: number | null }[] | null = null
    let gradeCourseId: number | null = null

    for (const c of list) {
      if (aulasMuestreadas.length >= 5 && gradeItemsSample) break
      let enrolled
      try {
        enrolled = await moodleCall('core_enrol_get_enrolled_users', { courseid: c.id })
      } catch { continue }
      const users = (Array.isArray(enrolled) ? enrolled : [])
      if (!users.length) continue
      if (aulasMuestreadas.length < 5) {
        aulasMuestreadas.push({ id: c.id, shortname: c.shortname, matriculados: users.length })
        for (const u of users as { email?: string; idnumber?: string }[]) {
          usuarios++
          const em = (u.email ?? '').toLowerCase().trim()
          const idn = String(u.idnumber ?? '').trim()
          if (em) {
            conEmail++
            const dom = em.split('@')[1] ?? '?'
            dominios.set(dom, (dominios.get(dom) ?? 0) + 1)
            if (ourEmails.has(em)) emailCruza++
          }
          if (idn) { conIdnumber++; if (ourDocs.has(idn)) idnumberCruza++ }
        }
      }
      // Grade items del primer aula con alumnos
      if (!gradeItemsSample && out.site.puede_leer_notas) {
        try {
          const rep = await moodleCall('gradereport_user_get_grade_items', { courseid: c.id })
          const items = rep?.usergrades?.[0]?.gradeitems
          if (Array.isArray(items) && items.length) {
            gradeCourseId = c.id
            gradeItemsSample = items.map((i: { itemname: string | null; itemtype: string; itemmodule: string | null; grademax: number | null }) =>
              ({ itemname: i.itemname, itemtype: i.itemtype, itemmodule: i.itemmodule, grademax: i.grademax }))
          }
        } catch { /* aula sin reporte */ }
      }
    }

    out.identificacion = {
      aulas_muestreadas: aulasMuestreadas,
      usuarios_vistos: usuarios,
      con_email: conEmail,
      con_idnumber: conIdnumber,
      cruzan_por_email_con_academic_students: emailCruza,
      cruzan_por_idnumber_con_documento: idnumberCruza,
      dominios_de_correo: Object.fromEntries([...dominios.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)),
    }
    out.grade_items = gradeItemsSample ? { courseid: gradeCourseId, items: gradeItemsSample } : null

    return NextResponse.json(out)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e), parcial: out }, { status: 502 })
  }
}
