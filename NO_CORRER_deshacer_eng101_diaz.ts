// DESHACER del arreglo ENG 101 de Diaz Campos (2026-08-31). NO CORRER salvo
// reversión: repone la fila vacía de Activa, su detalle, la matrícula attempt 2
// y re-enlaza la nota 92.67 a donde estaba.
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf8')
const get = (k: string) => env.split('\n').find(l => l.startsWith(k + '='))?.slice(k.length + 1).trim()
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL')!, get('SUPABASE_SERVICE_ROLE_KEY')!)

async function main() {
  const r = JSON.parse(fs.readFileSync('NO_CORRER_respaldo_eng101_diaz.json', 'utf8'))
  if (r.matricula_a2) {
    const { error } = await sb.from('academic_course_enrollments')
      .upsert(r.matricula_a2, { onConflict: 'student_id,course_id,attempt', ignoreDuplicates: true })
    if (error) throw new Error('matricula: ' + error.message)
  }
  const { error: e1 } = await sb.from('academic_grades').upsert(r.fila, { onConflict: 'external_id' })
  if (e1) throw new Error('fila: ' + e1.message)
  if (r.detalle) {
    await sb.from('academic_grade_details').delete().eq('external_id', r.fila.external_id)
    const { error: e2 } = await sb.from('academic_grade_details').insert(r.detalle)
    if (e2) throw new Error('detalle: ' + e2.message)
  }
  if (r.nota_reenlazada) {
    const { error: e3 } = await sb.from('academic_grades')
      .update({ course_enrollment_id: r.nota_reenlazada.course_enrollment_id_anterior })
      .eq('external_id', r.nota_reenlazada.external_id)
    if (e3) throw new Error('reenlace: ' + e3.message)
  }
  console.log('deshecho')
}
main().catch(e => { console.error(e); process.exit(1) })
