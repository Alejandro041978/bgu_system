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
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  if (!moodleConfigured()) {
    return NextResponse.json({ error: 'Faltan MOODLE_URL / MOODLE_WS_TOKEN en Vercel' }, { status: 400 })
  }

  const ids = (req.nextUrl.searchParams.get('courseid') ?? '')
    .split(',').map(n => Number(n.trim())).filter(n => n > 0)

  try {
    const r = await moodleCall('local_bgugrades_get_grade_structure', { courseids: ids })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aulas: any[] = r?.aulas ?? []
    return NextResponse.json({
      ok: true,
      pedidas: ids.length ? ids : 'todas',
      aulas_devueltas: aulas.length,
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
