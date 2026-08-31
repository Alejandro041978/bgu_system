// DESHACER de la reasignación de homónimas intercambiadas (2026-08-31,
// 4 notas: 3× Supply Chain MBA→BSBA y 1× Microeconomics BSBA→Accounting).
// NO CORRER salvo reversión: devuelve a cada nota su course_id y su enlace
// de matrícula anteriores, y repone la matrícula del programa de origen.
// Las matrículas creadas en el destino quedan huérfanas y las siega el
// protocolo habitual; el egreso de Ramos lo recalcula el cron.
//   npx tsx NO_CORRER_deshacer_reasignacion_homonimas.ts
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf8')
const get = (k: string) => env.split('\n').find(l => l.startsWith(k + '='))?.slice(k.length + 1).trim()
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL')!, get('SUPABASE_SERVICE_ROLE_KEY')!)

async function main() {
  const respaldo = JSON.parse(fs.readFileSync('NO_CORRER_respaldo_reasignacion_homonimas.json', 'utf8'))
  let ok = 0, err = 0
  for (const r of respaldo) {
    try {
      if (r.matricula_anterior) {
        const { error } = await sb.from('academic_course_enrollments')
          .upsert(r.matricula_anterior, { onConflict: 'student_id,course_id,attempt', ignoreDuplicates: true })
        if (error) throw new Error('matricula: ' + error.message)
      }
      const { error: eU } = await sb.from('academic_grades')
        .update({ course_id: r.nota.course_id, course_enrollment_id: r.nota.course_enrollment_id })
        .eq('external_id', r.nota.external_id)
      if (eU) throw new Error('nota: ' + eU.message)
      ok++
    } catch (e) { err++; console.log('✗', r.nota.external_id, e instanceof Error ? e.message : e) }
  }
  console.log(`deshechas: ${ok} de ${respaldo.length} | errores: ${err}`)
}
main().catch(e => { console.error(e); process.exit(1) })
