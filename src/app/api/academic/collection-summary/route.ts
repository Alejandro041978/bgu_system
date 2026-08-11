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
    const [cats, progs, studs, enrs, cols, groups, mem] = await Promise.all([
      todo(sb, 'academic_programs_category', 'id, name'),
      todo(sb, 'academic_programs', 'id, name, category_id, partner_campus'),
      todo(sb, 'academic_students', 'id, situation'),
      todo(sb, 'academic_student_enrollments', 'id, student_id, program_id, collection_id'),
      todo(sb, 'moodle_collections', 'id, program_id, name, active'),
      todo(sb, 'academic_groups', 'id, program_id, abbreviation, name, next_group_id'),
      todo(sb, 'academic_group_students', 'group_id, student_id, status'),
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

    // Carruseles ACTIVOS de cada estudiante, por programa. El carrusel es la
    // ruta —qué cursa y en qué orden—; la colección es el aula. Cruzarlos es
    // lo que enseña cómo están vinculados de verdad.
    const grupo = new Map(groups.map(g => [g.id, g]))
    const etiqueta = (gid: string) => {
      const g = grupo.get(gid)
      return g ? ([g.abbreviation, g.name].filter(Boolean).join(' · ') || gid) : gid
    }
    const rutasDe = new Map<string, string[]>()   // `${student}|${program}` → group_ids
    for (const m of mem) {
      if (m.status !== 'activo') continue
      const g = grupo.get(m.group_id)
      if (!g?.program_id) continue
      const k = `${m.student_id}|${g.program_id}`
      if (!rutasDe.has(k)) rutasDe.set(k, [])
      rutasDe.get(k)!.push(m.group_id)
    }

    // (programa × colección) → cuántas, y dentro, el reparto por carrusel. La
    // fila sin colección es una más, con su nombre puesto: un hueco con nombre
    // se persigue, un hueco vacío no.
    interface Celda {
      collection_id: string | null; coleccion: string; matriculas: number
      carruseles: Map<string, number>; sin_carrusel: number
    }
    interface Bloque {
      program_id: string; programa: string; externo: boolean
      total: number; sin_coleccion: number; sin_carrusel: number
      carruseles_del_programa: number
      celdas: Map<string, Celda>
    }
    const porPrograma = new Map<string, Bloque>()
    const nuevoBloque = (pid: string): Bloque => {
      const p = prog.get(pid)
      return {
        program_id: pid, programa: p?.name ?? pid, externo: !!p?.partner_campus,
        total: 0, sin_coleccion: 0, sin_carrusel: 0,
        carruseles_del_programa: groups.filter(g => g.program_id === pid).length,
        celdas: new Map(),
      }
    }
    const celdaDe = (b: Bloque, cid: string | null): Celda => {
      const k = cid ?? '—'
      if (!b.celdas.has(k)) {
        b.celdas.set(k, {
          collection_id: cid,
          coleccion: cid ? (colN.get(cid) ?? '(colección borrada)') : 'Sin colección',
          matriculas: 0, carruseles: new Map(), sin_carrusel: 0,
        })
      }
      return b.celdas.get(k)!
    }

    for (const e of enScope) {
      if (!porPrograma.has(e.program_id)) porPrograma.set(e.program_id, nuevoBloque(e.program_id))
      const b = porPrograma.get(e.program_id)!
      b.total++
      if (!e.collection_id) b.sin_coleccion++
      const c = celdaDe(b, e.collection_id ?? null)
      c.matriculas++
      const rutas = rutasDe.get(`${e.student_id}|${e.program_id}`) ?? []
      if (!rutas.length) { c.sin_carrusel++; b.sin_carrusel++ }
      for (const gid of rutas) c.carruseles.set(gid, (c.carruseles.get(gid) ?? 0) + 1)
    }

    // Las colecciones del ámbito que NO tienen ninguna matrícula también salen:
    // una colección armada y vacía es información, no ausencia de información.
    for (const c of cols) {
      if (!c.active) continue
      const p = prog.get(c.program_id)
      if (!p) continue
      if (programId ? c.program_id !== programId : p.category_id !== categoryId) continue
      if (!porPrograma.has(c.program_id)) porPrograma.set(c.program_id, nuevoBloque(c.program_id))
      celdaDe(porPrograma.get(c.program_id)!, c.id)
    }

    const programas = [...porPrograma.values()]
      .sort((a, b) => a.programa.localeCompare(b.programa))
      .map(b => ({
        program_id: b.program_id, programa: b.programa, externo: b.externo,
        total: b.total, sin_coleccion: b.sin_coleccion, sin_carrusel: b.sin_carrusel,
        carruseles_del_programa: b.carruseles_del_programa,
        colecciones: [...b.celdas.values()]
          // La fila sin colección va al final: es la que hay que vaciar.
          .sort((x, y) => Number(x.collection_id === null) - Number(y.collection_id === null) || x.coleccion.localeCompare(y.coleccion))
          .map(c => ({
            collection_id: c.collection_id, coleccion: c.coleccion,
            matriculas: c.matriculas, sin_carrusel: c.sin_carrusel,
            carruseles: [...c.carruseles.entries()]
              .map(([gid, n]) => ({ group_id: gid, label: etiqueta(gid), matriculas: n }))
              .sort((x, y) => y.matriculas - x.matriculas || x.label.localeCompare(y.label)),
          })),
      }))

    const total = enScope.length
    const sin = enScope.filter(e => !e.collection_id).length
    const sinRuta = programas.reduce((s, p) => s + p.sin_carrusel, 0)
    return NextResponse.json({
      catalogo,
      resumen: { total, con: total - sin, sin, sin_carrusel: sinRuta, programas: new Set(enScope.map(e => e.program_id)).size },
      programas,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}
