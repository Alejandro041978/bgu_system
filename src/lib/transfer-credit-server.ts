import { createClient } from '@supabase/supabase-js'
import { convertGrade } from './grade-convert'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/**
 * Primer periodo del estudiante (cuando inició estudios): la matrícula más antigua
 * en academic_student_enrollments; si no hay, la nota más antigua; si no, año actual.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function firstPeriod(sb: any, studentId: string | null, document: string | null): Promise<{ year: number | null; block: string | null }> {
  if (studentId) {
    const { data } = await sb.from('academic_student_enrollments')
      .select('term_year, term_block').eq('student_id', studentId).not('term_year', 'is', null)
      .order('term_year', { ascending: true }).order('term_block', { ascending: true }).limit(1)
    if (data?.[0]) return { year: data[0].term_year, block: data[0].term_block }
  }
  if (document) {
    const { data } = await sb.from('academic_grades')
      .select('term_year, term_block').eq('document_number', document).eq('source', 'systemactiva').not('term_year', 'is', null)
      .order('term_year', { ascending: true }).order('term_block', { ascending: true }).limit(1)
    if (data?.[0]) return { year: data[0].term_year, block: data[0].term_block }
  }
  return { year: new Date().getFullYear(), block: 'Convalidación' }
}

/**
 * Recalcula la nota convertida de un ítem y la refleja en academic_grades
 * (source='convalidacion') para que aparezca en "Mis Notas". Idempotente:
 * usa el id del ítem como external_id. Si no hay nota, borra el reflejo.
 * Devuelve la nota convertida (o null).
 */
export async function reflectItem(itemId: string): Promise<number | null> {
  const sb = db()

  const { data: item } = await sb.from('transfer_credit_items')
    .select('id, transfer_credit_id, origin_grade, dest_course_id, dest_course_name')
    .eq('id', itemId).maybeSingle()
  if (!item) return null

  const { data: tc } = await sb.from('transfer_credits')
    .select('scale_id, dest_program_id, student_id, student_document, student_name, kind')
    .eq('id', item.transfer_credit_id).maybeSingle()

  // Escala de origen
  const { data: scale } = tc?.scale_id
    ? await sb.from('grade_scales').select('origin_min, origin_max, origin_passing').eq('id', tc.scale_id).maybeSingle()
    : { data: null }

  // Nota de aprobación de destino (según categoría del programa de destino)
  let destPassing: number | null = null
  if (tc?.dest_program_id) {
    const { data: prog } = await sb.from('academic_programs').select('category_id').eq('id', tc.dest_program_id).maybeSingle()
    if (prog?.category_id) {
      const { data: cat } = await sb.from('academic_programs_category').select('passing_score').eq('id', prog.category_id).maybeSingle()
      destPassing = cat?.passing_score ?? null
    }
  }

  // Datos de la asignatura de destino
  const { data: course } = item.dest_course_id
    ? await sb.from('academic_courses').select('code, name, credits').eq('id', item.dest_course_id).maybeSingle()
    : { data: null }

  const converted = (item.origin_grade != null && scale && destPassing != null)
    ? convertGrade(Number(item.origin_grade), scale, Number(destPassing))
    : null

  await sb.from('transfer_credit_items').update({ converted_grade: converted }).eq('id', itemId)

  if (converted != null) {
    const period = await firstPeriod(sb, tc?.student_id ?? null, tc?.student_document ?? null)
    await sb.from('academic_grades').upsert({
      external_id: itemId,
      document_number: tc?.student_document ?? null,
      student_name: tc?.student_name ?? null,
      course_code: course?.code ?? null,
      course_name: course?.name ?? item.dest_course_name ?? null,
      credits: course?.credits ?? null,
      final_grade: converted,
      passing_score: destPassing,
      term_year: period.year,
      term_block: period.block,
      source: tc?.kind === 'validacion' ? 'validacion' : 'convalidacion',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'external_id' })
  } else {
    await sb.from('academic_grades').delete().eq('external_id', itemId)
  }

  return converted
}

/** Borra el reflejo en academic_grades de un ítem (al eliminarlo). */
export async function unreflectItem(itemId: string): Promise<void> {
  await db().from('academic_grades').delete().eq('external_id', itemId)
}
