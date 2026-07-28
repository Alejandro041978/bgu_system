import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')]}))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const COMMIT = process.argv.includes('--commit')
const norm = s => String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim()
async function all(tb,s){const o=[];for(let f=0;;f+=1000){const{data,error}=await sb.from(tb).select(s).range(f,f+999);if(error){console.log('ERR',error.message);process.exit(1)}o.push(...(data??[]));if((data??[]).length<1000)break}return o}

const grades = await all('academic_grades','external_id, document_number, course_name, source, final_grade, retake_grade, passing_score, moodle_course_id, withdrawn_at, edited_at, locked_at')
const byKey = new Map()
for (const g of grades) {
  const k = `${g.document_number}|${norm(g.course_name)}`
  if (!byKey.has(k)) byKey.set(k, [])
  byKey.get(k).push(g)
}
const toDelete = [], protegidas = []
for (const [, arr] of byKey) {
  if (arr.length < 2) continue
  const val = g => g.retake_grade ?? g.final_grade
  const sysOk = arr.find(g => g.source !== 'moodle' && g.source !== 'csv' && !g.withdrawn_at && val(g) != null && Number(val(g)) >= Number(g.passing_score ?? 70))
  if (!sysOk) continue
  for (const g of arr) {
    if (g === sysOk) continue
    if (!(g.source === 'moodle' || g.moodle_course_id)) continue
    if (g.edited_at || g.locked_at) { protegidas.push(g.external_id); continue }  // tocada por Registros: no borrar a ciegas
    toDelete.push(g.external_id)
  }
}
console.log(`Filas moodle duplicadas a BORRAR: ${toDelete.length} | protegidas (edited/locked, se saltan): ${protegidas.length}`)

if (!COMMIT) { console.log('\nDRY-RUN (nada borrado). Ejecutar con --commit para aplicar.'); process.exit(0) }

// 1) borrar detalles del acta de esas filas
let detDel = 0
for (let i = 0; i < toDelete.length; i += 150) {
  const part = toDelete.slice(i, i + 150)
  const { data } = await sb.from('academic_grade_details').select('id').in('external_id', part)
  if (data?.length) { const { error } = await sb.from('academic_grade_details').delete().in('id', data.map(d=>d.id)); if (!error) detDel += data.length }
}
// 2) borrar las filas de nota
let del = 0
for (let i = 0; i < toDelete.length; i += 150) {
  const part = toDelete.slice(i, i + 150)
  const { error } = await sb.from('academic_grades').delete().in('external_id', part)
  if (error) { console.log('ERROR delete:', error.message); break }
  del += part.length
}
console.log(`BORRADO: ${del} notas + ${detDel} detalles de acta.`)
