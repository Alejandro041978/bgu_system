const fs = require('fs')
const env = fs.readFileSync('C:/BGU_system/bgu-erp/.env.local', 'utf8')
const get = k => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1].trim()
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'))

async function todo(t, cols) {
  const out = []
  for (let d = 0; ; d += 1000) {
    const { data, error } = await sb.from(t).select(cols).range(d, d + 999)
    if (error) throw new Error(t + ': ' + error.message)
    out.push(...data); if (data.length < 1000) break
  }
  return out
}
const ALIASES = new Map([
  ['quantitative and qualitative methods for decision', 'quantitative and qualitative methods for decision making'],
  ['business administration capstone project', 'business administration capstone'],
  ['development of artificial intelligence application', 'development of artificial intelligence applications'],
])
const key = s => { const k = (s ?? '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); return ALIASES.get(k) ?? k }

;(async () => {
  const [cats, progs, courses, studs, enrs, grades, tcs, tItems] = await Promise.all([
    todo('academic_programs_category', 'id, name'),
    todo('academic_programs', 'id, name, category_id'),
    todo('academic_courses', 'id, program_id, name, code, credits'),
    todo('academic_students', 'id, document_number, situation'),
    todo('academic_student_enrollments', 'id, student_id, program_id'),
    todo('academic_grades', 'document_number, course_name, source'),
    todo('transfer_credits', 'id, student_id, dest_program_id, status'),
    todo('transfer_credit_items', 'transfer_credit_id, dest_course_id, dest_course_name'),
  ])
  const catName = new Map(cats.map(c => [c.id, c.name]))
  const prog = new Map(progs.map(p => [p.id, p]))
  const malla = new Map()
  for (const c of courses) { if (!malla.has(c.program_id)) malla.set(c.program_id, []); malla.get(c.program_id).push(c) }
  const stu = new Map(studs.map(s => [s.id, s]))
  const notasDe = new Map()
  for (const g of grades) {
    if (g.source === 'convalidacion' || g.source === 'validacion') continue
    const d = String(g.document_number ?? '')
    if (!notasDe.has(d)) notasDe.set(d, new Set())
    notasDe.get(d).add(key(g.course_name))
  }
  const itemsDe = new Map()
  for (const i of tItems) { if (!itemsDe.has(i.transfer_credit_id)) itemsDe.set(i.transfer_credit_id, []); itemsDe.get(i.transfer_credit_id).push(i) }
  const convDe = new Map()
  for (const t of tcs) {
    if (t.status !== 'active') continue
    const k = `${t.student_id}|${t.dest_program_id}`
    if (!convDe.has(k)) convDe.set(k, { ids: new Set(), nom: new Set() })
    for (const i of itemsDe.get(t.id) ?? []) { if (i.dest_course_id) convDe.get(k).ids.add(i.dest_course_id); convDe.get(k).nom.add(key(i.dest_course_name)) }
  }
  const res = {}
  let totalFilas = 0, totalAsig = 0
  for (const e of enrs) {
    const s = stu.get(e.student_id), p = prog.get(e.program_id)
    if (!s || !p) continue
    const cursos = malla.get(e.program_id) ?? []
    if (!cursos.length) continue
    const n = notasDe.get(String(s.document_number ?? '')) ?? new Set()
    const c = convDe.get(`${e.student_id}|${e.program_id}`) ?? { ids: new Set(), nom: new Set() }
    const huecos = cursos.filter(x => !n.has(key(x.name)) && !c.ids.has(x.id) && !c.nom.has(key(x.name)))
    if (!huecos.length) continue
    const cat = catName.get(p.category_id) ?? '—'
    const exenta = s.situation === 'retiro_permanente'
    res[cat] = res[cat] ?? { matriculas: 0, exentas: 0, asignaturas: 0, sinMalla: 0 }
    res[cat].matriculas++
    if (exenta) res[cat].exentas++
    else { res[cat].asignaturas += huecos.length; totalFilas++; totalAsig += huecos.length }
  }
  console.log('CATEGORÍA'.padEnd(48), 'incompletas  IW   asignaturas a crear')
  for (const [k, v] of Object.entries(res).sort((a, b) => b[1].matriculas - a[1].matriculas))
    console.log(k.padEnd(48), String(v.matriculas - v.exentas).padStart(6), String(v.exentas).padStart(5), String(v.asignaturas).padStart(12))
  console.log('\nTOTAL matrículas a completar:', totalFilas, '| filas de plan a crear:', totalAsig)
  process.exit(0)
})()
