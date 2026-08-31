// ---------------------------------------------------------------------------
// DESHACER del arbitraje de recursados fantasma (2026-08-31, 110 pares).
// NO CORRER salvo reversión. Restaura cada par tal cual estaba: las filas de
// notas (superviviente con su valor anterior y fantasmas revividas) y sus
// detalles. Las matrículas segadas NO están en el respaldo: el rebuild
// nocturno las recrea desde las notas restauradas (es solo-crear).
//   npx tsx NO_CORRER_deshacer_arbitraje.ts
// ---------------------------------------------------------------------------
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf8')
const get = (k: string) => env.split('\n').find(l => l.startsWith(k + '='))?.slice(k.length + 1).trim()
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL')!, get('SUPABASE_SERVICE_ROLE_KEY')!)

async function main() {
  const respaldo = JSON.parse(fs.readFileSync('NO_CORRER_respaldo_arbitraje.json', 'utf8'))
  let ok = 0, err = 0
  for (const r of respaldo) {
    try {
      for (const g of r.filas) {
        const { error } = await sb.from('academic_grades').upsert(g, { onConflict: 'external_id' })
        if (error) throw new Error(`fila ${g.external_id}: ${error.message}`)
        const { data: viva } = await sb.from('academic_grades').select('external_id').eq('external_id', g.external_id).maybeSingle()
        if (!viva) throw new Error(`la política descartó la reinserción de ${g.external_id}`)
      }
      const ids = r.filas.map((g: any) => g.external_id)
      await sb.from('academic_grade_details').delete().in('external_id', ids)
      for (const d of r.detalles ?? []) {
        const { error } = await sb.from('academic_grade_details').insert(d)
        if (error) throw new Error(`detalle ${d.external_id}: ${error.message}`)
      }
      ok++
    } catch (e) {
      err++
      console.log(`✗ ${r.doc} ${r.course}: ${e instanceof Error ? e.message : e}`)
    }
  }
  console.log(`deshechos: ${ok} de ${respaldo.length} | errores: ${err}`)
  console.log('Correr después el rebuild de matrículas (cron nocturno o POST /api/academic/course-enrollments/rebuild?apply=1).')
}
main().catch(e => { console.error(e); process.exit(1) })
