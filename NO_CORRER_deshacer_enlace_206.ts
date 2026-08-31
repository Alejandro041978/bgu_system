// DESHACER del enlace de notas sueltas (31-08-2026). NO CORRER salvo orden
// expresa: vacía course_enrollment_id de las notas enlazadas y devuelve a cada
// matrícula su estado previo, desde NO_CORRER_respaldo_enlace_206.json.
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
const env = fs.readFileSync('.env.local', 'utf8')
const get = (k: string) => env.split('\n').find(l => l.startsWith(k + '='))?.slice(k.length + 1).trim()
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL')!, get('SUPABASE_SERVICE_ROLE_KEY')!)

async function main() {
  const r = JSON.parse(fs.readFileSync('NO_CORRER_respaldo_enlace_206.json', 'utf8'))
  for (const f of r.filas) {
    const { error: e1 } = await sb.from('academic_grades')
      .update({ course_enrollment_id: f.prev_course_enrollment_id }).eq('external_id', f.external_id)
    const { error: e2 } = await sb.from('academic_course_enrollments')
      .update({ status: f.prev_status }).eq('id', f.matricula_id)
    if (e1 || e2) console.log('ERROR', f.external_id, e1?.message ?? '', e2?.message ?? '')
  }
  console.log('restauradas', r.filas.length, 'filas')
}
main().catch(e => { console.error(e); process.exit(1) })
