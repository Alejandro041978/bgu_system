import { NextRequest, NextResponse } from 'next/server'
import { esFilaDePlan } from '@/lib/grade-sources'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isStudentUser } from '@/lib/student-identity'
import { guardSuperadmin } from '@/lib/api-guard'
import {
  indexarMalla, resolverAsignatura, resolverTodasLasAsignaturas, estadoDeNota, ordenarIntentos,
  type NotaMin, type CursoMalla, type MotivoSinResolver,
} from '@/lib/course-enrollments'
import { courseNameKey } from '@/lib/course-match'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// El cron nocturno entra por el secreto, no por sesión: no hay ningún usuario
// detrás. Es la única puerta que no exige persona, y solo abre la
// reconstrucción — que es idempotente y no decide nada.
function esCron(req: NextRequest): boolean {
  const s = process.env.CRON_SECRET
  return !!s && req.headers.get('x-cron-secret') === s
}

async function requireStaff() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  if (await isStudentUser(user)) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) }
  return { user }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todo(sb: any, tabla: string, cols: string, orden: string, tune = (q: any) => q) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await tune(sb.from(tabla).select(cols)).order(orden).range(from, from + 999)
    if (error) throw new Error(`${tabla}: ${error.message}`)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

// ---------------------------------------------------------------------------
// Reconstruye la matrícula por asignatura a partir de las notas existentes.
//
// Cada fila de academic_grades es un intento: SystemActiva creaba una fila por
// cada vez que el estudiante llevaba la asignatura, con nota o vacía. El número
// de intento sale de ordenarlas por periodo.
//
// Por omisión es un SIMULACRO y no escribe nada. Con ?apply=1 escribe.
// Es idempotente: si el intento ya existe, no lo duplica.
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const cron = esCron(req)
  if (!cron) {
    const g = await requireStaff(); if ('error' in g) return g.error
  }
  const apply = req.nextUrl.searchParams.get('apply') === '1'
  // Crea inscripciones por asignatura leyendo las notas: toca el expediente en
  // masa. Misma llave que editar. Simular sigue abierto.
  if (apply && !cron) { const s = await guardSuperadmin(); if (s) return s }
  const sb = db()
  const t0 = Date.now()

  const students = await todo(sb, 'academic_students', 'id, document_number', 'id')
  const progEnr = await todo(sb, 'academic_student_enrollments', 'id, student_id, program_id, term_year', 'id')
  const courses = await todo(sb, 'academic_courses', 'id, program_id, name, code', 'id') as CursoMalla[]
  const programs = await todo(sb, 'academic_programs', 'id, name', 'id')
  const nombrePrograma = new Map<string, string>(programs.map((p: { id: string; name: string }) => [p.id, p.name]))
  const todasLasNotas = await todo(sb, 'academic_grades',
    'external_id, document_number, course_name, course_code, final_grade, retake_grade, passing_score, term_year, term_block, semester_id, withdrawn_at, synced_at, source, course_enrollment_id',
    'external_id') as (NotaMin & { course_enrollment_id: string | null; semester_id: string | null })[]

  // Las filas de plan SÍ entran ahora, y ésa es la novedad de este paso: una
  // asignatura inscrita y sin empezar pertenece al REGISTRO, no a la tabla de
  // notas. Entran con estado 'no_iniciada'.
  //
  // Pero no se numeran como intento: si el estudiante ya tiene una nota real de
  // esa asignatura, la fila de plan es una sombra —lo vimos el 14 de agosto,
  // 37 de ellas conviviendo con su nota— y numerarla convertiría lo no empezado
  // en el intento 1 y lo real en el 2. Por eso se descartan las de plan que
  // tengan un intento real al lado, y las que quedan van siempre como intento 1.
  const conIntentoReal = new Set<string>()
  for (const n of todasLasNotas) {
    if (esFilaDePlan(n)) continue
    conIntentoReal.add(`${n.document_number}|${courseNameKey(n.course_name)}`)
  }
  const grades = todasLasNotas.filter(n =>
    !esFilaDePlan(n) || !conIntentoReal.has(`${n.document_number}|${courseNameKey(n.course_name)}`))

  const idx = indexarMalla(courses)
  const stuByDoc = new Map<string, { id: string }>()
  for (const s of students) stuByDoc.set(String(s.document_number ?? ''), s)
  const progsOf = new Map<string, string[]>()
  const progEnrOf = new Map<string, string>()   // `${student_id}|${program_id}` → matrícula de programa
  for (const e of progEnr) {
    if (!progsOf.has(e.student_id)) progsOf.set(e.student_id, [])
    if (!progsOf.get(e.student_id)!.includes(e.program_id)) progsOf.get(e.student_id)!.push(e.program_id)
    const k = `${e.student_id}|${e.program_id}`
    if (!progEnrOf.has(k)) progEnrOf.set(k, e.id)
  }

  // 1. Resolver cada nota a una asignatura del plan
  const sinResolver = new Map<MotivoSinResolver, number>()
  const ejemplos: Record<string, string[]> = {}
  const ambiguas: string[] = []
  let ambiguasN = 0
  // documento → programa al que apuntan sus notas no resueltas. Una nota cuya
  // asignatura existe pero en otro programa casi nunca es un error de nombre:
  // es una matrícula de programa que falta en el ERP (un estudiante que cursó
  // un bachelor y hoy sólo tiene registrado su máster).
  const faltaPrograma = new Map<string, Map<string, number>>()
  // (student_id + course_id) → notas de ese estudiante en esa asignatura
  const porIntento = new Map<string, { student_id: string; course_id: string; program_id: string | null; notas: NotaMin[] }>()

  for (const n of grades) {
    const stu = stuByDoc.get(String(n.document_number ?? ''))
    if (!stu) {
      sinResolver.set('sin_alumno', (sinResolver.get('sin_alumno') ?? 0) + 1)
      continue
    }
    const r = resolverAsignatura(n, progsOf.get(stu.id), idx)
    if (!r.course_id) {
      const m = r.motivo ?? 'fuera_de_malla'
      sinResolver.set(m, (sinResolver.get(m) ?? 0) + 1)
      ejemplos[m] = ejemplos[m] ?? []
      if (ejemplos[m].length < 8 && n.course_name) ejemplos[m].push(`${n.document_number} · ${n.course_name}`)
      if (m === 'otro_programa') {
        const doc = String(n.document_number ?? '')
        if (!faltaPrograma.has(doc)) faltaPrograma.set(doc, new Map())
        const cuenta = faltaPrograma.get(doc)!
        for (const c of (idx.porNombre.get(courseNameKey(n.course_name)) ?? [])) {
          if (c.program_id) cuenta.set(c.program_id, (cuenta.get(c.program_id) ?? 0) + 1)
        }
      }
      continue
    }
    // Una nota puede pertenecer a DOS mallas a la vez: nueve estudiantes cursan
    // dos programas que comparten dieciocho asignaturas. Se abre matrícula en
    // cada una, porque la institución cobra en los dos programas (Dirección,
    // 14-08-2026). Elegir una sola dejaba al otro programa en 87 créditos de
    // 120 y le bajaba el precio oficial sin que nadie lo decidiera.
    const destinos = resolverTodasLasAsignaturas(n, progsOf.get(stu.id), idx)
    if (destinos.length > 1) {
      ambiguasN++
      if (ambiguas.length < 40) ambiguas.push(`${n.document_number} · ${n.course_name} → ${destinos.length} mallas`)
    }
    for (const d of (destinos.length ? destinos : [{ id: r.course_id, program_id: r.program_id }])) {
      const k = `${stu.id}|${d.id}`
      if (!porIntento.has(k)) porIntento.set(k, { student_id: stu.id, course_id: d.id, program_id: d.program_id, notas: [] })
      porIntento.get(k)!.notas.push(n)
    }
  }

  // 2. Un intento por nota, numerado por periodo
  const nuevas: Record<string, unknown>[] = []
  const enlaces: { external_id: string; course_id: string; course_enrollment_id: string }[] = []
  let variosIntentos = 0
  for (const grupo of porIntento.values()) {
    // Las no empezadas nunca numeran: van todas como intento 1. Solo llegan
    // aquí las que no tienen un intento real al lado, así que no compiten.
    const reales = grupo.notas.filter(n => !esFilaDePlan(n))
    const ordenadas = [...ordenarIntentos(reales), ...grupo.notas.filter(n => esFilaDePlan(n))]
    if (reales.length > 1) variosIntentos++
    ordenadas.forEach((n, i) => {
      const id = crypto.randomUUID()
      const plan = esFilaDePlan(n)
      nuevas.push({
        id,
        student_id: grupo.student_id,
        document_number: n.document_number,
        course_id: grupo.course_id,
        program_id: grupo.program_id,
        program_enrollment_id: grupo.program_id ? (progEnrOf.get(`${grupo.student_id}|${grupo.program_id}`) ?? null) : null,
        attempt: plan ? 1 : i + 1,
        term_year: n.term_year,
        term_block: n.term_block,
        // El periodo con la nomenclatura del ERP. term_year/term_block se
        // siguen copiando mientras existan, pero éste es el que manda.
        semester_id: n.semester_id ?? null,
        status: estadoDeNota(n),
        source: plan ? 'plan' : (n.source === 'moodle' ? 'moodle' : 'systemactiva'),
        opened_by: 'reconstruccion',
      })
      enlaces.push({ external_id: n.external_id, course_id: grupo.course_id, course_enrollment_id: id })
    })
  }

  const resumen = {
    simulacro: !apply,
    notas_leidas: grades.length,
    matriculas_a_crear: nuevas.length,
    asignaturas_con_mas_de_un_intento: variosIntentos,
    ambiguas_resueltas_por_defecto: ambiguasN,
    sin_resolver: Object.fromEntries(sinResolver),
    ejemplos_sin_resolver: ejemplos,
    muestra_ambiguas: ambiguas.slice(0, 10),
    // Accionable para Registros: a cada uno le falta la matrícula del programa
    // que ya cursó. Corregido eso, esta reconstrucción se vuelve a correr y las
    // notas se enlazan solas — es idempotente.
    matriculas_de_programa_faltantes: [...faltaPrograma.entries()]
      .map(([doc, cuenta]) => {
        const [pid, n] = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0]
        return { documento: doc, notas_sin_enlazar: [...cuenta.values()].reduce((s, v) => Math.max(s, v), 0), programa_probable: nombrePrograma.get(pid) ?? pid, coincidencias: n }
      })
      .sort((a, b) => b.notas_sin_enlazar - a.notas_sin_enlazar),
    duracion_s: 0 as number,
  }
  if (!apply) {
    resumen.duracion_s = Math.round((Date.now() - t0) / 1000)
    return NextResponse.json(resumen)
  }

  // 3. Escribir. El unique (student_id, course_id, attempt) hace la operación
  //    repetible: una segunda corrida no duplica nada.
  let creadas = 0
  for (let i = 0; i < nuevas.length; i += 500) {
    const { error } = await sb.from('academic_course_enrollments')
      .upsert(nuevas.slice(i, i + 500), { onConflict: 'student_id,course_id,attempt', ignoreDuplicates: true })
    if (error) return NextResponse.json({ ...resumen, error: `Al crear matrículas: ${error.message}`, creadas }, { status: 500 })
    creadas += Math.min(500, nuevas.length - i)
  }

  // 4. Enlazar cada nota con su asignatura y su intento. Se releen los ids
  //    reales: si una matrícula ya existía, el upsert conservó el id anterior.
  const reales = await todo(sb, 'academic_course_enrollments', 'id, student_id, course_id, attempt', 'id')
  const idReal = new Map<string, string>()
  for (const e of reales) idReal.set(`${e.student_id}|${e.course_id}|${e.attempt}`, e.id)
  const porId = new Map(nuevas.map(n => [String(n.id), n]))

  let enlazadas = 0
  for (let i = 0; i < enlaces.length; i += 500) {
    const lote = enlaces.slice(i, i + 500).map(e => {
      const n = porId.get(e.course_enrollment_id)
      const real = n ? idReal.get(`${n.student_id}|${n.course_id}|${n.attempt}`) : null
      return { external_id: e.external_id, course_id: e.course_id, course_enrollment_id: real ?? e.course_enrollment_id }
    })
    const { error } = await sb.from('academic_grades').upsert(lote, { onConflict: 'external_id' })
    if (error) return NextResponse.json({ ...resumen, error: `Al enlazar notas: ${error.message}`, creadas, enlazadas }, { status: 500 })
    enlazadas += lote.length
  }

  resumen.duracion_s = Math.round((Date.now() - t0) / 1000)
  return NextResponse.json({ ...resumen, creadas, enlazadas })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
