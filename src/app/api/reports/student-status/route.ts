import { NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { guardStaff } from '@/lib/api-guard'

export const revalidate = 0
export const maxDuration = 120

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readAll(sb: any, table: string, cols: string): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(cols).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

// ---------------------------------------------------------------------------
// "Estado de estudiantes" en TRES reportes, cada uno con su identidad cerrada
// (rediseño del usuario, 20/08/2026). El anterior mezclaba las tres preguntas
// en nueve columnas con denominadores distintos, y ninguna fila sumaba.
//
//  R1 · Ciclo de vida (unidad: MATRÍCULA, por categoría)
//       Activos = Matriculados − Titulados − Egresados − Retirados netos
//       Campus socio NO interviene: es una forma de estar activo.
//
//  R2 · Dónde estudian los activos (unidad: matrícula ACTIVA, por categoría)
//       Activos = Moodle (programas nuestros) + Campus socio
//       Con el desglose del lado Moodle: en carrusel / sin colocar / con
//       cuenta. "Sin colocar" es la lista de trabajo: gente que debería estar
//       cursando y no tiene ruta asignada.
//
//  R3 · Retirados (unidad: RETIRO, resumen)
//       Retirados netos = (LOA − revertidos) + (IW − ReEntry − Reincorporados)
//       ReEntry = reincorporación CON trámite y pago (enlace en la fila).
//       Reincorporados = reversión SIN pago (era anterior al cobro).
//       Un LOA convertido a IW cuenta UNA vez, como IW.
//
// R1 cuenta matrículas y R3 cuenta retiros: un estudiante retirado con dos
// programas pesa 2 en R1 y 1 en R3. No es un descuadre, es la unidad.
// ---------------------------------------------------------------------------
export async function GET() {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sb = db()
  try {
    const cats = await readAll(sb, 'academic_programs_category', 'id, name, sigla')
    const nameOfCat = new Map<string, string>(cats.map((c: { id: string; name: string }) => [c.id, c.name]))
    const siglaOfCat = new Map<string, string | null>(cats.map((c: { id: string; sigla: string | null }) => [c.id, c.sigla]))

    const programs = await readAll(sb, 'academic_programs', 'id, category_id, partner_campus')
    const catOfProgram = new Map<string, string | null>(programs.map((p: { id: string; category_id: string | null }) => [p.id, p.category_id]))
    const partnerPrograms = new Set<string>(
      (programs as { id: string; partner_campus: boolean | null }[]).filter(p => p.partner_campus).map(p => p.id))

    const enrolls = await readAll(sb, 'academic_student_enrollments', 'student_id, program_id')
    const grads = await readAll(sb, 'student_graduations', 'student_id, program_id, titulacion_status')
    const gradOf = new Map<string, string>(
      (grads as { student_id: string; program_id: string; titulacion_status: string }[])
        .map(g => [`${g.student_id}|${g.program_id}`, g.titulacion_status]))

    // Retiros: la fuente es student_withdrawals, no la "situación" derivada.
    const wds = await readAll(sb, 'student_withdrawals',
      'id, student_id, type, status, converted_to_id, reincorporated_charge_external_id, reincorporated_tramite_id')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const retiradosVigentes = new Set<string>()   // estudiantes con retiro vigente
    const r3 = {
      loa_total: 0, loa_revertidos: 0, loa_convertidos: 0, loa_vigentes: 0, loa_otros: 0,
      iw_total: 0, iw_reentry: 0, iw_reincorporados: 0, iw_vigentes: 0, iw_otros: 0,
      retirados_netos: 0,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const w of wds as any[]) {
      if (w.type === 'LOA') {
        // Un LOA convertido ya es un IW: se cuenta una sola vez, en IW.
        if (w.converted_to_id) { r3.loa_convertidos++; continue }
        r3.loa_total++
        if (w.status === 'vigente') { r3.loa_vigentes++; retiradosVigentes.add(String(w.student_id)) }
        else if (w.status === 'reincorporado') r3.loa_revertidos++
        else r3.loa_otros++
      } else if (w.type === 'IW') {
        r3.iw_total++
        if (w.status === 'vigente') { r3.iw_vigentes++; retiradosVigentes.add(String(w.student_id)) }
        else if (w.status === 'reincorporado') {
          // La distinción que pidió el usuario: ReEntry pagó su trámite;
          // Reincorporado es la reversión de la era sin cobro (los "en ámbar").
          if (w.reincorporated_charge_external_id) r3.iw_reentry++
          else r3.iw_reincorporados++
        } else r3.iw_otros++
      }
    }
    r3.retirados_netos = r3.loa_vigentes + r3.iw_vigentes

    // Carruseles activos por (estudiante, programa)
    const groups = await readAll(sb, 'academic_groups', 'id, program_id')
    const programOfGroup = new Map<string, string | null>(groups.map((g: { id: string; program_id: string | null }) => [g.id, g.program_id]))
    const memberships = await readAll(sb, 'academic_group_students', 'group_id, student_id, status')
    const inCarousel = new Set<string>()
    for (const m of memberships as { group_id: string; student_id: string; status: string }[]) {
      if (m.status !== 'activo') continue
      const pid = programOfGroup.get(m.group_id)
      if (pid) inCarousel.add(`${m.student_id}|${pid}`)
    }
    const students = await readAll(sb, 'academic_students', 'id, moodle_user_id')
    const hasMoodleAccount = new Set<string>(
      (students as { id: string; moodle_user_id: string | null }[]).filter(s => s.moodle_user_id).map(s => s.id))

    // ── R1 y R2 en la misma pasada por matrícula ──────────────────────────
    type R1 = { matriculados: number; titulados: number; egresados: number; retirados: number; activos: number }
    type R2 = { activos: number; moodle: number; campus_socio: number; en_carrusel: number; sin_colocar: number; con_cuenta: number }
    const zero1 = (): R1 => ({ matriculados: 0, titulados: 0, egresados: 0, retirados: 0, activos: 0 })
    const zero2 = (): R2 => ({ activos: 0, moodle: 0, campus_socio: 0, en_carrusel: 0, sin_colocar: 0, con_cuenta: 0 })
    const r1ByCat = new Map<string, R1>(); const r1Total = zero1()
    const r2ByCat = new Map<string, R2>(); const r2Total = zero2()
    const seen = new Set<string>()

    for (const e of enrolls as { student_id: string | null; program_id: string | null }[]) {
      if (!e.student_id || !e.program_id) continue
      const pair = `${e.student_id}|${e.program_id}`
      if (seen.has(pair)) continue
      seen.add(pair)
      const catKey = catOfProgram.get(e.program_id) ?? '__none__'
      if (!r1ByCat.has(catKey)) r1ByCat.set(catKey, zero1())
      const c1 = r1ByCat.get(catKey)!
      const grad = gradOf.get(pair)

      c1.matriculados++; r1Total.matriculados++
      if (grad === 'titulado') { c1.titulados++; r1Total.titulados++; continue }
      if (grad) { c1.egresados++; r1Total.egresados++; continue }
      // El retiro es del estudiante: arrastra sus matrículas no terminadas.
      if (retiradosVigentes.has(e.student_id)) { c1.retirados++; r1Total.retirados++; continue }
      c1.activos++; r1Total.activos++

      // R2: solo las activas
      if (!r2ByCat.has(catKey)) r2ByCat.set(catKey, zero2())
      const c2 = r2ByCat.get(catKey)!
      c2.activos++; r2Total.activos++
      if (partnerPrograms.has(e.program_id)) { c2.campus_socio++; r2Total.campus_socio++ }
      else {
        c2.moodle++; r2Total.moodle++
        if (inCarousel.has(pair)) { c2.en_carrusel++; r2Total.en_carrusel++ }
        else { c2.sin_colocar++; r2Total.sin_colocar++ }
        if (hasMoodleAccount.has(e.student_id)) { c2.con_cuenta++; r2Total.con_cuenta++ }
      }
    }

    const toRows = <T,>(m: Map<string, T>, orderKey: keyof T) => [...m.entries()].map(([key, c]) => ({
      category: key === '__none__' ? '(Sin categoría)' : (nameOfCat.get(key) ?? key),
      sigla: key === '__none__' ? '—' : (siglaOfCat.get(key) ?? nameOfCat.get(key) ?? key),
      ...c,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })).sort((a: any, b: any) => Number(b[orderKey]) - Number(a[orderKey]))

    return NextResponse.json({
      r1: { rows: toRows(r1ByCat, 'matriculados' as never), total: r1Total },
      r2: { rows: toRows(r2ByCat, 'activos' as never), total: r2Total },
      r3,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo armar el reporte' }, { status: 500 })
  }
}
