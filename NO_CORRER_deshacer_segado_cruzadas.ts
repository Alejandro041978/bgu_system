// DESHACER del segado de matrículas cruzadas entre programas (2026-08-31,
// 20 filas de 8 estudiantes). NO CORRER salvo reversión: repone las filas de
// academic_course_enrollments tal cual estaban. El egreso BSBA de Ramos
// Escobal NO se repone aquí (fue una detección falsa; si hiciera falta lo
// recrearía el cron con las reglas que estén vigentes).
//   npx tsx NO_CORRER_deshacer_segado_cruzadas.ts
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf8')
const get = (k: string) => env.split('\n').find(l => l.startsWith(k + '='))?.slice(k.length + 1).trim()
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL')!, get('SUPABASE_SERVICE_ROLE_KEY')!)

async function main() {
  const filas = JSON.parse(fs.readFileSync('NO_CORRER_respaldo_segado_cruzadas.json', 'utf8'))
  let ok = 0, err = 0
  for (const f of filas) {
    const { _curso, ...fila } = f
    void _curso
    const { error } = await sb.from('academic_course_enrollments')
      .upsert(fila, { onConflict: 'student_id,course_id,attempt', ignoreDuplicates: true })
    if (error) { err++; console.log('✗', fila.id, error.message) } else ok++
  }
  console.log(`repuestas: ${ok} de ${filas.length} | errores: ${err}`)
}
main().catch(e => { console.error(e); process.exit(1) })
