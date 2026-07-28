import { readFileSync, writeFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')]}))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const COMMIT = process.argv.includes('--commit')
const norm = s => String(s??'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim()
const ALIASES = new Map([
  ['quantitative and qualitative methods for decision','quantitative and qualitative methods for decision making'],
  ['business administration capstone project','business administration capstone'],
  ['development of artificial intelligence application','development of artificial intelligence applications'],
])
const key = s => { const k = norm(s); return ALIASES.get(k) ?? k }
async function all(tb,s){const o=[];for(let f=0;;f+=1000){const{data,error}=await sb.from(tb).select(s).range(f,f+999);if(error){console.log('ERR',tb,error.message);process.exit(1)}o.push(...(data??[]));if((data??[]).length<1000)break}return o}

// Mallas por programa: name-key → code (colisión dentro del programa = se descarta)
const courses = await all('academic_courses','program_id, code, name')
const mallaByProg = new Map()
for (const c of courses) {
  if (!c.program_id || !c.code) continue
  if (!mallaByProg.has(c.program_id)) mallaByProg.set(c.program_id, new Map())
  const m = mallaByProg.get(c.program_id)
  const k = key(c.name)
  if (m.has(k) && m.get(k) !== c.code) m.set(k, null)  // ambiguo dentro del programa
  else if (!m.has(k)) m.set(k, c.code)
}

// Programas por estudiante (por documento)
const stus = await all('academic_students','id, document_number')
const docToId = new Map(stus.map(s=>[String(s.document_number??''), s.id]))
const enr = await all('academic_student_enrollments','student_id, program_id')
const progsByStu = new Map()
for (const e of enr) { if(!e.student_id||!e.program_id) continue; if(!progsByStu.has(e.student_id)) progsByStu.set(e.student_id,new Set()); progsByStu.get(e.student_id).add(e.program_id) }

// Notas a corregir: fuentes no-importación (moodle/csv ya traen código real)
const grades = await all('academic_grades','external_id, document_number, course_code, course_name, source, edited_at')
const plan = [], ambiguous = []
for (const g of grades) {
  if (g.source === 'moodle' || g.source === 'csv') continue
  const sid = docToId.get(String(g.document_number??''))
  if (!sid) continue
  const progs = [...(progsByStu.get(sid) ?? [])]
  const codes = new Set()
  for (const p of progs) { const m = mallaByProg.get(p); const c = m?.get(key(g.course_name)); if (c) codes.add(c) }
  if (codes.size === 1) {
    const code = [...codes][0]
    if (String(g.course_code??'') !== code) plan.push({ external_id: g.external_id, old: g.course_code, code, edited: !!g.edited_at, name: g.course_name })
  } else if (codes.size > 1) ambiguous.push(g.external_id)
}
console.log(`Notas analizadas: ${grades.length} | a corregir: ${plan.length} (con edited_at: ${plan.filter(p=>p.edited).length}) | ambiguas entre programas: ${ambiguous.length}`)
const sample = plan.slice(0,8).map(p=>`${p.old} → ${p.code} (${String(p.name).slice(0,30)})`)
console.log('Muestra:', sample.join(' | '))

if (!COMMIT) { console.log('\nDRY-RUN. --commit para aplicar (respalda antes en scratchpad).'); process.exit(0) }

writeFileSync('C:/Users/geren/AppData/Local/Temp/claude/C--BGU-system/5b5592f3-0398-45b1-bd19-147ee69adfe1/scratchpad/course_code_backup_20260728.json', JSON.stringify(plan))
let done=0, errs=0
for (const p of plan) {
  const patch = p.edited ? { course_code: p.code, edited_at: new Date().toISOString() } : { course_code: p.code }
  const { error } = await sb.from('academic_grades').update(patch).eq('external_id', p.external_id)
  if (error) errs++; else done++
}
console.log(`APLICADO: ${done} corregidas, ${errs} errores. Respaldo en scratchpad (course_code_backup_20260728.json).`)
