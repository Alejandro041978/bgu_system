// DESHACER de la auditoría de actas del arbitraje (31-08-2026). NO CORRER
// salvo orden expresa: restaura la nota de Heredia (100) y los 15 detalles
// congelados previos desde NO_CORRER_respaldo_detalles_auditoria.json.
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf8')
const get = (k: string) => env.split('\n').find(l => l.startsWith(k + '='))?.slice(k.length + 1).trim()
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL')!, get('SUPABASE_SERVICE_ROLE_KEY')!)

async function main() {
  const r = JSON.parse(fs.readFileSync('NO_CORRER_respaldo_detalles_auditoria.json', 'utf8'))
  const g = r.heredia_nota
  const { error: e1 } = await sb.from('academic_grades').update({
    final_grade: g.final_grade, estado_academico: g.estado_academico,
    edited_at: new Date().toISOString(), edited_by: g.edited_by,
  }).eq('external_id', g.external_id)
  console.log('Heredia restaurada a', g.final_grade, e1 ? 'ERROR ' + e1.message : 'ok')
  for (const d of r.detalles) {
    const { id, ...campos } = d
    const { error } = await sb.from('academic_grade_details').update(campos).eq('id', id)
    console.log('detalle', d.course_name, error ? 'ERROR ' + error.message : 'ok')
  }
}
main().catch(e => { console.error(e); process.exit(1) })
