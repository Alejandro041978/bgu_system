import { NextRequest, NextResponse } from 'next/server'
import { moodleCall, moodleConfigured } from '@/lib/moodle'
import { guardStaff } from '@/lib/api-guard'

export const revalidate = 0
export const maxDuration = 120

// ---------------------------------------------------------------------------
// Diagnóstico del complemento local_bgugrades: pide la estructura del libro de
// calificaciones de un aula y devuelve lo que Moodle contesta, tal cual.
//
// Existe para no escribir el lado del ERP contra una forma supuesta. El
// complemento lo escribimos nosotros, pero entre lo que uno declara en el PHP y
// lo que el webservice serializa hay diferencias —campos opcionales que
// desaparecen, números que llegan como texto— y descubrirlas después, con el
// auditor ya cableado, cuesta el doble.
//
// Solo lee. Cuando el auditor use la función de verdad, esto se queda como
// herramienta de diagnóstico: sirve para mirar un aula concreta sin barrer nada.
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  // Sesión de personal, o Bearer CRON_SECRET para diagnosticar desde fuera
  // (solo lectura; las credenciales de Moodle viven únicamente en Vercel).
  const esCron = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  if (!esCron) {
    const noAutorizado = await guardStaff()
    if (noAutorizado) return noAutorizado
  }

  if (!moodleConfigured()) {
    return NextResponse.json({ error: 'Faltan MOODLE_URL / MOODLE_WS_TOKEN en Vercel' }, { status: 400 })
  }

  const ids = (req.nextUrl.searchParams.get('courseid') ?? '')
    .split(',').map(n => Number(n.trim())).filter(n => n > 0)

  try {
    const r = await moodleCall('local_bgugrades_get_grade_structure', { courseids: ids })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aulas: any[] = r?.aulas ?? []
    // ?enrol=1 → además, los métodos de matrícula de esas aulas
    // (core_enrol_get_course_enrolment_methods, la otra función del auditor):
    // sirve para comprobar que el token la tiene habilitada.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let metodos: any = undefined
    if (req.nextUrl.searchParams.get('enrol') === '1' && ids.length) {
      metodos = {}
      for (const id of ids.slice(0, 5)) {
        try {
          const ms = await moodleCall('core_enrol_get_course_enrolment_methods', { courseid: id })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          metodos[id] = (ms ?? []).map((m: any) => ({ type: m.type, name: m.name, status: m.status }))
        } catch (e) { metodos[id] = { error: e instanceof Error ? e.message : 'error' } }
      }
    }
    return NextResponse.json({
      ok: true,
      pedidas: ids.length ? ids : 'todas',
      aulas_devueltas: aulas.length,
      metodos_matricula: metodos,
      // Un resumen legible por aula, y la primera entera para ver la forma real.
      resumen: aulas.map(a => ({
        courseid: a.courseid,
        aggregation_raiz: a.aggregation_raiz,
        escala_total: a.escala_total,
        suma_coeficientes: a.suma_coeficientes,
        items: (a.items ?? []).length,
        items_activos: (a.items ?? []).filter((i: { activo: boolean }) => i.activo).length,
        categorias: (a.categorias ?? []).length,
      })),
      muestra: aulas[0] ?? null,
    })
  } catch (e) {
    // El error de Moodle dicho como es: si la función no está añadida al
    // servicio externo, contesta "acceso denegado a la función externa", que
    // despista si uno espera "no existe".
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : 'error',
      pista: 'Si dice acceso denegado, falta añadir local_bgugrades_get_grade_structure al servicio externo del ERP, o la capacidad moodle/grade:viewall al usuario del token.',
    }, { status: 502 })
  }
}
