// ---------------------------------------------------------------------------
// DESHACER de la fusión de recursados fantasma (2026-08-30). NO CORRER salvo
// que haya que revertirla. Restaura las 99 filas originales de Activa, vuelve a
// crear las 99 filas moodle intento≥2 borradas y devuelve los detalles a su
// external_id de origen. Lee NO_CORRER_respaldo_fusion_recursados.json.
//
//   npx tsx NO_CORRER_deshacer_fusion_recursados.ts
// ---------------------------------------------------------------------------
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf8')
const get = (k: string) => env.split('\n').find(l => l.startsWith(k + '='))?.slice(k.length + 1).trim()
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL')!, get('SUPABASE_SERVICE_ROLE_KEY')!)

async function main() {
  const respaldo = JSON.parse(fs.readFileSync('NO_CORRER_respaldo_fusion_recursados.json', 'utf8'))
  let ok = 0, err = 0
  for (const p of respaldo) {
    try {
      // 1. filas de notas tal cual estaban (la de Activa recupera su valor,
      //    fuente, periodo y edited_at; la moodle renace con su intento≥2,
      //    que es lo que la deja pasar por la política)
      const { error: e1 } = await sb.from('academic_grades').upsert(p.activa, { onConflict: 'external_id' })
      if (e1) throw new Error('activa: ' + e1.message)
      const { error: e2 } = await sb.from('academic_grades').upsert(p.moodle, { onConflict: 'external_id' })
      if (e2) throw new Error('moodle: ' + e2.message)
      // comprobar que la moodle de verdad renació (la política descarta sin error)
      const { data: viva } = await sb.from('academic_grades').select('external_id').eq('external_id', p.moodle.external_id).maybeSingle()
      if (!viva) throw new Error('la política descartó la reinserción de la fila moodle')

      // 2. detalles a su sitio original
      const ids = [p.activa.external_id, p.moodle.external_id]
      const { error: e3 } = await sb.from('academic_grade_details').delete().in('external_id', ids)
      if (e3) throw new Error('detalle-del: ' + e3.message)
      for (const d of [p.detalle_activa, p.detalle_moodle]) {
        if (!d) continue
        const { error: e4 } = await sb.from('academic_grade_details').insert(d)
        if (e4) throw new Error('detalle-ins: ' + e4.message)
      }
      ok++
    } catch (e) {
      err++
      console.log(`✗ ${p.activa.document_number} ${p.activa.course_code}: ${e instanceof Error ? e.message : e}`)
    }
  }
  console.log(`deshechas: ${ok} | errores: ${err}`)
}
main().catch(e => { console.error(e); process.exit(1) })
