// ---------------------------------------------------------------------------
// DESHACER del segado de matrículas huérfanas (2026-08-30). NO CORRER salvo
// que haya que revertirlo. Reinserta las 114 filas de
// academic_course_enrollments borradas, tal cual estaban, desde
// NO_CORRER_respaldo_segado_huerfanas.json.
//
//   npx tsx NO_CORRER_deshacer_segado_huerfanas.ts
// ---------------------------------------------------------------------------
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf8')
const get = (k: string) => env.split('\n').find(l => l.startsWith(k + '='))?.slice(k.length + 1).trim()
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL')!, get('SUPABASE_SERVICE_ROLE_KEY')!)

async function main() {
  const filas = JSON.parse(fs.readFileSync('NO_CORRER_respaldo_segado_huerfanas.json', 'utf8'))
  let ok = 0, err = 0
  for (let i = 0; i < filas.length; i += 200) {
    const { error } = await sb.from('academic_course_enrollments')
      .upsert(filas.slice(i, i + 200), { onConflict: 'student_id,course_id,attempt', ignoreDuplicates: true })
    if (error) { err++; console.log('✗ lote', i, error.message) } else ok += Math.min(200, filas.length - i)
  }
  console.log(`repuestas: ${ok} | lotes con error: ${err}`)
}
main().catch(e => { console.error(e); process.exit(1) })
