import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { guardStaff } from '@/lib/api-guard'
import { isStudentUser } from '@/lib/student-identity'

export const revalidate = 0
export const maxDuration = 120

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireStaff() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  if (await isStudentUser(user)) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) }
  return { user }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todo(sb: any, tabla: string, cols: string): Promise<any[]> {
  const out: unknown[] = []
  for (let d = 0; ; d += 1000) {
    const { data, error } = await sb.from(tabla).select(cols).range(d, d + 999)
    if (error) throw new Error(`${tabla}: ${error.message}`)
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return out as any[]
}

// ---------------------------------------------------------------------------
// Resumen de matrículas por colección de aulas.
//
// Para ir viendo el problema por partes en vez de un solo número de 1.081:
// se filtra por categoría y programa, y se ve el reparto real — cuántas
// matrículas hay en cada colección y cuántas siguen sin ninguna.
//
// Se cuentan las matrículas de estudiantes ACTIVOS, que es el universo que
// importa: un egresado ya no entra a ningún aula.
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const noAutorizado = await guardStaff(); if (noAutorizado) return noAutorizado
  const g = await requireStaff(); if ('error' in g) return g.error

  const sp = req.nextUrl.searchParams
  const categoryId = sp.get('category_id')
  const programId = sp.get('program_id')
  const sb = db()

  try {
    const [cats, progs, studs, enrs, cols] = await Promise.all([
      todo(sb, 'academic_programs_category', 'id, name'),
      todo(sb, 'academic_programs', 'id, name, category_id, partner_campus'),
      todo(sb, 'academic_students', 'id, situation'),
      todo(sb, 'academic_student_enrollments', 'id, student_id, program_id, collection_id'),
      todo(sb, 'moodle_collections', 'id, program_id, name, active'),
    ])

    // Catálogos para los filtros: solo categorías y programas que tienen
    // matrículas, para no ofrecer combinaciones que devuelven vacío.
    const catalogo = {
      categorias: cats.map(c => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name)),
      programas: progs.map(p => ({ id: p.id, name: p.name, category_id: p.category_id }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }
    if (!categoryId) return NextResponse.json({ catalogo, filas: null })

    const activo = new Set(studs.filter(s => (s.situation ?? 'activo') === 'activo').map(s => s.id))
    const prog = new Map(progs.map(p => [p.id, p]))
    const colN = new Map(cols.map(c => [c.id, c.name]))

    const enScope = enrs.filter(e => {
      if (!activo.has(e.student_id)) return false
      const p = prog.get(e.program_id)
      if (!p) return false
      if (programId) return e.program_id === programId
      return p.category_id === categoryId
    })

    // (programa × colección) → cuántas. La fila sin colección es una más, con
    // su nombre puesto: un hueco con nombre se persigue, un hueco vacío no.
    const cuenta = new Map<string, { program_id: string; programa: string; externo: boolean; collection_id: string | null; coleccion: string; matriculas: number }>()
    for (const e of enScope) {
      const p = prog.get(e.program_id)
      const k = `${e.program_id}|${e.collection_id ?? '—'}`
      if (!cuenta.has(k)) {
        cuenta.set(k, {
          program_id: e.program_id, programa: p.name, externo: !!p.partner_campus,
          collection_id: e.collection_id ?? null,
          coleccion: e.collection_id ? (colN.get(e.collection_id) ?? '(colección borrada)') : 'Sin colección',
          matriculas: 0,
        })
      }
      cuenta.get(k)!.matriculas++
    }

    // Las colecciones del ámbito que NO tienen ninguna matrícula también salen:
    // una colección armada y vacía es información, no ausencia de información.
    for (const c of cols) {
      if (!c.active) continue
      const p = prog.get(c.program_id)
      if (!p) continue
      if (programId ? c.program_id !== programId : p.category_id !== categoryId) continue
      const k = `${c.program_id}|${c.id}`
      if (!cuenta.has(k)) {
        cuenta.set(k, {
          program_id: c.program_id, programa: p.name, externo: !!p.partner_campus,
          collection_id: c.id, coleccion: c.name, matriculas: 0,
        })
      }
    }

    const filas = [...cuenta.values()].sort((a, b) =>
      a.programa.localeCompare(b.programa)
      // La fila sin colección va al final de su programa: es la que hay que vaciar.
      || Number(a.collection_id === null) - Number(b.collection_id === null)
      || a.coleccion.localeCompare(b.coleccion))

    const total = enScope.length
    const sin = enScope.filter(e => !e.collection_id).length
    return NextResponse.json({
      catalogo,
      resumen: { total, con: total - sin, sin, programas: new Set(enScope.map(e => e.program_id)).size },
      filas,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}
