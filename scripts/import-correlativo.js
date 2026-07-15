/**
 * Importación única del registro histórico de retiros (la planilla de Registros).
 *
 * Contexto: los 285 IW que trajimos de SystemativA salieron del campo de texto
 * libre WithdrawalResolutionNumber, que está transcrito con erratas. La planilla
 * "Correlativo - RETIROS" es el registro oficial. Desde ahora los retiros nacen
 * en el ERP, así que nuestra BD debe ser el registro completo y correcto.
 *
 * Qué hace:
 *   1. Normaliza la escritura de las resoluciones existentes (N°, °, año con
 *      guion, "I-" por "IW-").
 *   2. Corrige los números errados usando la planilla como autoridad.
 *   3. Importa los retiros históricos que faltan en nuestra BD.
 *   4. Marca como 'reincorporado' a quienes figuran en la hoja Re-entry, para no
 *      dejarlos como retirados vigentes.
 *
 * Uso:  node scripts/import-correlativo.js          (ensayo, no escribe)
 *       node scripts/import-correlativo.js --apply  (aplica)
 */
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const APPLY = process.argv.includes('--apply')
const SHEETS = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(__dirname, 'sheets.json')

const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
const get = k => { const m = env.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim() : null }
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'))

const readAll = async (t, c) => { let o = []; for (let f = 0; ; f += 1000) { const { data, error } = await sb.from(t).select(c).range(f, f + 999); if (error) throw new Error(t + ': ' + error.message); const r = data || []; o = o.concat(r); if (r.length < 1000) break } return o }

// --- normalizadores -------------------------------------------------------
// Ojo: la planilla guarda los DNI numéricos en notación científica ("7.0988173E7"),
// así que hay que reconocerla antes de descartar por "tiene letras" (la E).
// Los que sí son alfanuméricos ("0010510860011N") se dejan tal cual.
const dni = v => {
  const s = String(v ?? '').trim()
  if (/^\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s)) { const n = Number(s); if (isFinite(n) && n > 0) return String(Math.round(n)) }
  return s.toUpperCase()
}
const serialToDate = v => { const n = Number(v); if (!isFinite(n) || n < 20000 || n > 60000) return null; return new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10) }

// Devuelve { seq, year, type, token, text } con el texto ya canonizado.
function canon(raw) {
  let s = String(raw ?? '').toUpperCase().replace(/N°|°/g, ' ').replace(/\s+/g, ' ').trim()
  s = s.replace(/(\d{4})\s*-\s*(\d{4})/, '$1/$2')          // 2025-2026 -> 2025/2026
  const m = s.match(/(\d+)\s*-+\s*(\d{4}\/\d{4})\s*-+\s*(IW|I|LOA|CW)\s*-+\s*([A-Z]+)/)
  if (!m) return null
  const type = m[3] === 'I' ? 'IW' : m[3]
  const seq = +m[1], year = m[2], token = m[4]
  return { seq, year, type, token, text: `${String(seq).padStart(3, '0')}-${year}-${type}-${token}` }
}

;(async () => {
  const S = JSON.parse(fs.readFileSync(SHEETS, 'utf8'))

  // ---------- planilla ----------
  // Dos hojas alimentan el mismo registro:
  //   "Correlativo - RETIROS" → Bachelor / Master / Doctorate
  //   "Retiros DCE"           → Educación Continua (misma serie NNN-AAAA/AAAA-IW-DCE;
  //                             el "R.A. N° 005-2025-GEN-ORG" que también aparece ahí
  //                             es otro documento, no el correlativo de retiro)
  const sheetRows = []
  for (const r of S['Correlativo - RETIROS'].slice(1).filter(r => r && r[1] && r[2])) {
    const c = canon(r[1]); const d = dni(r[2])
    if (!c || !d || d.length < 5) continue
    sheetRows.push({ dni: d, canon: c, date: serialToDate(r[8]), nombre: String(r[3] ?? '').trim() })
  }
  const nCor = sheetRows.length
  for (const r of (S['Retiros DCE'] || []).slice(4).filter(r => r && r[5])) {
    const c = canon(r[21]); const d = dni(r[4])
    if (!c || !d || d.length < 5) continue
    sheetRows.push({ dni: d, canon: c, date: serialToDate(r[20]) ?? serialToDate(r[15]), nombre: String(r[5] ?? '').trim() })
  }
  console.log('Planilla: Correlativo =', nCor, '| Retiros DCE =', sheetRows.length - nCor, '| DNIs =', new Set(sheetRows.map(x => x.dni)).size)

  // ---------- nuestra BD ----------
  const studs = await readAll('academic_students', 'id, document_number')
  const idByDni = new Map()
  studs.forEach(s => { const d = dni(s.document_number); if (d) idByDni.set(d, s.id) })
  const wds = await readAll('student_withdrawals', 'id, student_id, resolution_number, withdrawal_date, type, status')
  const byStudent = new Map()
  wds.forEach(w => { if (!byStudent.has(w.student_id)) byStudent.set(w.student_id, []); byStudent.get(w.student_id).push(w) })

  const plan = { normalizar: [], corregir: [], insertar: [], sinEstudiante: [], ambiguo: [] }
  const diasEntre = (a, b) => (!a || !b) ? 1e9 : Math.abs((new Date(a) - new Date(b)) / 86400000)

  // agrupar planilla por dni
  const sheetByDni = new Map()
  sheetRows.forEach(x => { if (!sheetByDni.has(x.dni)) sheetByDni.set(x.dni, []); sheetByDni.get(x.dni).push(x) })

  for (const [d, rows] of sheetByDni) {
    const sid = idByDni.get(d)
    if (!sid) { rows.forEach(x => plan.sinEstudiante.push(`${d} ${x.canon.text} (${x.nombre})`)); continue }
    const dbRows = (byStudent.get(sid) ?? []).slice()
    const usados = new Set()

    for (const x of rows) {
      const cOf = w => canon(w.resolution_number)

      // 1) Mismo seq+tipo+nivel: es el mismo retiro, sólo mal escrito.
      let hit = dbRows.find(w => { const c = cOf(w); return !usados.has(w.id) && c && c.seq === x.canon.seq && c.type === x.canon.type && c.token === x.canon.token })
      let motivo = 'normalizar'

      // 2) Mismo tipo+nivel Y MISMO AÑO, pero otra secuencia: número mal tipeado.
      //    El año debe coincidir; si difiere son DOS retiros distintos del mismo
      //    estudiante (se retiró, reingresó y volvió a retirarse) y fusionarlos
      //    destruiría el registro bueno.
      if (!hit) {
        hit = dbRows.find(w => { const c = cOf(w); return !usados.has(w.id) && c && c.type === x.canon.type && c.token === x.canon.token && c.year === x.canon.year })
        if (hit) motivo = 'corregir'
      }

      // 3) Fila corrupta (nombre, "0", etc.): sólo si la fecha calza (±60 días),
      //    porque sin número no hay otra forma de saber a qué retiro corresponde.
      if (!hit) {
        hit = dbRows.find(w => !usados.has(w.id) && !cOf(w) && diasEntre(w.withdrawal_date, x.date) <= 60)
        if (hit) motivo = 'corregir'
      }

      if (hit) {
        usados.add(hit.id)
        const c = cOf(hit)
        if (c && c.year !== x.canon.year) plan.ambiguo.push(`DNI ${d}: BD="${hit.resolution_number}" vs planilla="${x.canon.text}" (año distinto; se toma el de la planilla)`)
        if (String(hit.resolution_number).trim() !== x.canon.text) {
          plan[motivo].push({ id: hit.id, de: hit.resolution_number, a: x.canon.text, dni: d, fecha: motivo === 'corregir' ? x.date : null })
        }
      } else {
        plan.insertar.push({ student_id: sid, type: x.canon.type === 'CW' ? 'IW' : x.canon.type, resolution_number: x.canon.text, withdrawal_date: x.date, dni: d })
      }
    }
  }

  // ---------- Re-entry: quienes volvieron no son retirados vigentes ----------
  // En esta hoja el DNI no cae en la columna que anuncia la cabecera (hay celdas
  // combinadas), así que se busca el primer valor con pinta de documento.
  const re = (S['Re-entry'] || []).slice(4).filter(r => r && r[5])
  const reDni = r => {
    for (const i of [4, 1, 2, 3, 0]) {
      const d = dni(r[i])
      if (d && d.length >= 5 && idByDni.has(d)) return d
    }
    for (const i of [4, 1, 2, 3]) { const d = dni(r[i]); if (d && d.length >= 5) return d }
    return null
  }
  const reDnis = new Set(re.map(reDni).filter(x => x && x.length >= 5))
  const reMatch = [...reDnis].filter(d => idByDni.has(d))
  console.log('Re-entry: filas =', re.length, '| DNIs =', reDnis.size, '| con estudiante en BD =', reMatch.length)

  // ---------- informe ----------
  console.log('\n' + '='.repeat(72))
  console.log('PLAN' + (APPLY ? ' (APLICANDO)' : ' (ENSAYO — no escribe nada)'))
  console.log('='.repeat(72))
  console.log('  Normalizar escritura .......', plan.normalizar.length)
  console.log('  Corregir número errado .....', plan.corregir.length)
  console.log('  Insertar histórico faltante ', plan.insertar.length)
  console.log('  Planilla sin estudiante ....', plan.sinEstudiante.length)

  console.log('  Año en conflicto (revisar) .', plan.ambiguo.length)
  if (plan.corregir.length) { console.log('\nCORRECCIONES DE NÚMERO:'); plan.corregir.forEach(c => console.log(`   DNI ${c.dni}:  "${c.de}"  ->  "${c.a}"`)) }
  if (plan.ambiguo.length) { console.log('\nAÑO EN CONFLICTO:'); plan.ambiguo.forEach(c => console.log('   ' + c)) }
  console.log('\nNORMALIZACIONES (muestra):'); plan.normalizar.slice(0, 6).forEach(c => console.log(`   "${c.de}"  ->  "${c.a}"`))
  console.log('\nINSERCIONES (muestra):'); plan.insertar.slice(0, 6).forEach(c => console.log(`   DNI ${c.dni}  ${c.resolution_number}  ${c.withdrawal_date ?? '(sin fecha)'}`))
  if (plan.sinEstudiante.length) { console.log('\nPLANILLA SIN ESTUDIANTE EN LA BD (muestra):'); plan.sinEstudiante.slice(0, 8).forEach(c => console.log('   ' + c)) }

  if (!APPLY) { console.log('\n>>> Ensayo. Ejecuta con --apply para escribir.'); return }

  // ---------- aplicar ----------
  let n = 0
  for (const c of [...plan.normalizar, ...plan.corregir]) {
    // Al corregir un número mal tipeado también se trae la fecha de la planilla:
    // dejar el número de un retiro con la fecha de otro sería peor que no tocarlo.
    const patch = { resolution_number: c.a }
    if (c.fecha) patch.withdrawal_date = c.fecha
    const { error } = await sb.from('student_withdrawals').update(patch).eq('id', c.id)
    if (error) console.log('  error update', c.id, error.message); else n++
  }
  console.log('\nActualizados:', n)

  let ins = 0
  for (let i = 0; i < plan.insertar.length; i += 100) {
    const chunk = plan.insertar.slice(i, i + 100).map(x => ({
      student_id: x.student_id, type: x.type, resolution_number: x.resolution_number,
      withdrawal_date: x.withdrawal_date ?? '2024-01-01', status: 'vigente', source: 'planilla',
    }))
    const { error } = await sb.from('student_withdrawals').insert(chunk)
    if (error) console.log('  error insert', error.message); else ins += chunk.length
  }
  console.log('Insertados:', ins)

  // Re-entry -> marcar reincorporado el retiro más antiguo de cada quien volvió
  let rein = 0
  for (const d of reMatch) {
    const sid = idByDni.get(d)
    const { data: rows } = await sb.from('student_withdrawals').select('id, withdrawal_date').eq('student_id', sid).eq('status', 'vigente').order('withdrawal_date', { ascending: true })
    if (!rows || !rows.length) continue
    const { error } = await sb.from('student_withdrawals').update({ status: 'reincorporado', note: 'Reincorporado (hoja Re-entry).' }).eq('id', rows[0].id)
    if (!error) rein++
  }
  console.log('Marcados como reincorporado:', rein)
  console.log('\n>>> Listo. Recalcula situaciones con /api/cron/graduates o el endpoint de retiros.')
})()
