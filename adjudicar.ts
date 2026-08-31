// Aplica UNA adjudicación de la página de homónimas (autorización permanente
// del usuario, 31-08-2026: "marcan → ejecuto → el caso desaparece").
//   npx tsx adjudicar.ts <eid_notaA> duplicado|dos
// duplicado: sobrevive la nota B (bien asignada); la fila A se borra con su
//            detalle y su matrícula si queda sin notas.
// dos:       la fila A se muda al programa de su evidencia como cursada propia.
import { createClient } from '@supabase/supabase-js'
import { stableUuid } from './src/lib/grades-write'
import { asegurarMatriculas, sincronizarEstadoDeMatricula, estadoDeNota, type MatriculaDeNota } from './src/lib/course-enrollments'
import { recomputeStudentByDocument } from './src/lib/graduates'
import { advanceCarousels } from './src/lib/carousel'
import { courseNameKey } from './src/lib/course-match'
import * as fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf8')
const get = (k: string) => env.split('\n').find(l => l.startsWith(k + '='))?.slice(k.length + 1).trim()
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL')!, get('SUPABASE_SERVICE_ROLE_KEY')!)
const ACTOR = stableUuid('adjudicacion:homonimas')
const RESPALDO = 'NO_CORRER_respaldo_adjudicaciones.json'

async function main() {
  const [eid, opcion] = process.argv.slice(2)
  if (!eid || !['duplicado', 'dos'].includes(opcion)) throw new Error('uso: adjudicar.ts <eid> duplicado|dos')

  const { data: A } = await sb.from('academic_grades').select('*').eq('external_id', eid).maybeSingle()
  if (!A) throw new Error('la nota A ya no existe')
  const { data: detA } = await sb.from('academic_grade_details').select('*').eq('external_id', eid).maybeSingle()
  const enrA = A.course_enrollment_id
    ? (await sb.from('academic_course_enrollments').select('*').eq('id', A.course_enrollment_id).maybeSingle()).data : null

  // programa de la evidencia = donde vive la homónima bien asignada (nota B)
  const { data: cursoA } = await sb.from('academic_courses').select('id, code, name, program_id').eq('id', A.course_id).maybeSingle()
  const { data: hermanas } = await sb.from('academic_grades').select('*')
    .eq('document_number', A.document_number).neq('external_id', eid)
  const B = (hermanas ?? []).find(h => h.course_id !== A.course_id && courseNameKey(h.course_name) === courseNameKey(A.course_name)
    && (h.retake_grade ?? h.final_grade) != null)

  const historial = fs.existsSync(RESPALDO) ? JSON.parse(fs.readFileSync(RESPALDO, 'utf8')) : []
  historial.push({ opcion, aplicado_en: new Date().toISOString(), notaA: A, detalleA: detA, matriculaA: enrA, notaB_eid: B?.external_id ?? null })
  fs.writeFileSync(RESPALDO, JSON.stringify(historial, null, 1))

  if (opcion === 'duplicado') {
    if (!B) throw new Error('no hay nota B homónima con valor: no se puede fusionar')
    await sb.from('grade_audit').insert({
      grade_external_id: B.external_id, document_number: A.document_number, course_name: B.course_name,
      field: 'final_grade', old_value: String(B.retake_grade ?? B.final_grade), new_value: String(B.retake_grade ?? B.final_grade),
      reason: `Adjudicación de Registros (página de homónimas): duplicado — la fila ${eid} (${A.final_grade}, ${cursoA?.code}) era la MISMA cursada y se eliminó; queda esta`,
      origin: 'editor', changed_by: ACTOR,
    })
    await sb.from('academic_grade_details').delete().eq('external_id', eid)
    const { error: eDel } = await sb.from('academic_grades').delete().eq('external_id', eid)
    if (eDel) throw new Error('delete A: ' + eDel.message)
    if (enrA) {
      const { count } = await sb.from('academic_grades').select('external_id', { count: 'exact', head: true }).eq('course_enrollment_id', enrA.id)
      if (!count) await sb.from('academic_course_enrollments').delete().eq('id', enrA.id)
    }
    await sincronizarEstadoDeMatricula(sb, String(B.external_id))
    console.log(`fusionado: queda ${B.external_id} (${B.retake_grade ?? B.final_grade}) — la fila A y su matrícula se retiraron`)
  } else {
    // dos cursadas: A se muda al programa de su evidencia (la malla de B), como
    // cursada propia con su matrícula — el intento lo numera el periodo
    if (!B) throw new Error('no hay homónima que identifique el programa de la evidencia')
    const { data: destino } = await sb.from('academic_courses').select('id, code, program_id').eq('id', B.course_id).maybeSingle()
    if (!destino) throw new Error('curso destino no existe')
    const intento = Number(B.intento ?? 1) + 1
    await sb.from('grade_audit').insert({
      grade_external_id: eid, document_number: A.document_number, course_name: A.course_name,
      field: 'course_id', old_value: String(A.course_id), new_value: String(destino.id),
      reason: 'Adjudicación de Registros (página de homónimas): dos cursadas reales — esta nota pertenece al programa de su evidencia',
      origin: 'editor', changed_by: ACTOR,
    })
    const { error: eU } = await sb.from('academic_grades').update({ course_id: destino.id, intento }).eq('external_id', eid)
    if (eU) throw new Error('update: ' + eU.message)
    const { data: stus } = await sb.from('academic_students').select('id').eq('document_number', A.document_number)
    for (const s of (stus ?? []) as { id: string }[]) {
      const fila: MatriculaDeNota = {
        student_id: s.id, document_number: String(A.document_number), course_id: String(destino.id),
        program_id: String(destino.program_id), attempt: intento,
        semester_id: A.semester_id ?? null, term_year: A.term_year ?? null, term_block: A.term_block ?? null,
        status: estadoDeNota(A, null), source: String(A.source ?? 'systemactiva'),
      }
      const r = await asegurarMatriculas(sb, [fila], 'adjudicacion-homonimas')
      if (r.error) throw new Error('matricula: ' + r.error)
      const { data: m } = await sb.from('academic_course_enrollments').select('id')
        .eq('student_id', s.id).eq('course_id', destino.id).eq('attempt', intento).maybeSingle()
      if (m) await sb.from('academic_grades').update({ course_enrollment_id: m.id }).eq('external_id', eid)
    }
    if (enrA) {
      const { count } = await sb.from('academic_grades').select('external_id', { count: 'exact', head: true }).eq('course_enrollment_id', enrA.id)
      if (!count) await sb.from('academic_course_enrollments').delete().eq('id', enrA.id)
    }
    await sincronizarEstadoDeMatricula(sb, eid)
    console.log(`movida: ${eid} → ${destino.code} intento ${intento}`)
  }

  // verificación + recálculo
  const { data: sigueA } = await sb.from('academic_grades').select('external_id, course_id').eq('external_id', eid).maybeSingle()
  console.log('verificación fila A:', opcion === 'duplicado' ? (sigueA ? '✗ SIGUE VIVA' : 'borrada ✓') : JSON.stringify(sigueA))
  await recomputeStudentByDocument(sb, String(A.document_number))
  const { data: stus2 } = await sb.from('academic_students').select('id').eq('document_number', A.document_number)
  for (const s of (stus2 ?? []) as { id: string }[]) await advanceCarousels(sb, { studentId: s.id })
  console.log('recalculado', A.document_number)
}
main().catch(e => { console.error(e); process.exit(1) })
