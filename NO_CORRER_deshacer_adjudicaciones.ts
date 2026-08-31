// DESHACER de las adjudicaciones de la página de homónimas. NO CORRER salvo
// reversión. Repone, en orden inverso, cada caso aplicado según
// NO_CORRER_respaldo_adjudicaciones.json: la fila A con su detalle y su
// matrícula (duplicado), o su course_id/intento originales (dos cursadas).
//   npx tsx NO_CORRER_deshacer_adjudicaciones.ts
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf8')
const get = (k: string) => env.split('\n').find(l => l.startsWith(k + '='))?.slice(k.length + 1).trim()
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL')!, get('SUPABASE_SERVICE_ROLE_KEY')!)

async function main() {
  const historial = JSON.parse(fs.readFileSync('NO_CORRER_respaldo_adjudicaciones.json', 'utf8'))
  let ok = 0, err = 0
  for (const h of [...historial].reverse()) {
    try {
      if (h.matriculaA) {
        const { error } = await sb.from('academic_course_enrollments')
          .upsert(h.matriculaA, { onConflict: 'student_id,course_id,attempt', ignoreDuplicates: true })
        if (error) throw new Error('matricula: ' + error.message)
      }
      const { error: e1 } = await sb.from('academic_grades').upsert(h.notaA, { onConflict: 'external_id' })
      if (e1) throw new Error('nota: ' + e1.message)
      const { data: viva } = await sb.from('academic_grades').select('external_id').eq('external_id', h.notaA.external_id).maybeSingle()
      if (!viva) throw new Error('la política descartó la reinserción')
      if (h.detalleA) {
        await sb.from('academic_grade_details').delete().eq('external_id', h.notaA.external_id)
        const { error: e2 } = await sb.from('academic_grade_details').insert(h.detalleA)
        if (e2) throw new Error('detalle: ' + e2.message)
      }
      ok++
    } catch (e) { err++; console.log('✗', h.notaA?.external_id, e instanceof Error ? e.message : e) }
  }
  console.log(`deshechas: ${ok} de ${historial.length} | errores: ${err}`)
}
main().catch(e => { console.error(e); process.exit(1) })
