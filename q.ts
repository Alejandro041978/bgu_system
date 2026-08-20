import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'
const env = readFileSync('C:/BGU_system/bgu-erp/.env.local', 'utf8')
const G = (k: string) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim()
const sb = createClient(G('NEXT_PUBLIC_SUPABASE_URL')!, G('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } }) as any
const APLICAR = process.argv.includes('--aplicar')
const todo = async (t: string, cols: string, orden: string) => {
  const out: any[] = []
  for (let f = 0; ; f += 1000) {
    const { data, error } = await sb.from(t).select(cols).order(orden).range(f, f + 999)
    if (error) throw new Error(`${t}: ${error.message}`); out.push(...(data ?? [])); if ((data ?? []).length < 1000) break
  }
  return out
}
;(async () => {
  // La columna nueva tiene que existir (migracion corrida) antes de aplicar
  const { error: eCol } = await sb.from('student_withdrawals').select('reincorporated_charge_external_id').limit(1)
  if (eCol) { console.log(`FALTA LA MIGRACION: ${eCol.message}`); if (APLICAR) return }
  const w = await todo('student_withdrawals', '*', 'id')
  const reinc = w.filter((x: any) => x.type === 'IW' && x.status === 'reincorporado' && !x.reincorporated_charge_external_id)
  console.log(`IW reincorporados sin enlace: ${reinc.length} (${new Set(reinc.map((x: any) => String(x.student_id))).size} estudiantes)`)
  const sids = [...new Set(reinc.map((x: any) => String(x.student_id)))]
  const ch = await todo('account_charges', 'external_id, student_id, charge_type, due_date', 'id')
  const reentryCh = ch.filter((c: any) => Number(c.charge_type) === 22 && sids.includes(String(c.student_id)))
  const py = await todo('account_payments', 'charge_external_id, paid_date, transaction_reference', 'id')
  const pagoDe = new Map<string, any>()
  for (const p of py) if (p.charge_external_id && !pagoDe.has(String(p.charge_external_id))) pagoDe.set(String(p.charge_external_id), p)
  const est = await todo('academic_students', 'id, first_name, last_name', 'id')
  const nom = new Map<string, string>(est.map((e: any) => [String(e.id), `${e.first_name} ${e.last_name}`]))

  const plan: any[] = []; let ambiguos = 0, sinCuota = 0
  for (const sid of sids) {
    const retiros = reinc.filter((x: any) => String(x.student_id) === sid)
      .sort((a: any, b: any) => String(a.withdrawal_date).localeCompare(String(b.withdrawal_date)))
    const cuotas = reentryCh.filter((c: any) => String(c.student_id) === sid)
      .map((c: any) => ({ ...c, pago: pagoDe.get(String(c.external_id)) }))
      .filter((c: any) => c.pago)
      .sort((a: any, b: any) => String(a.pago.paid_date).localeCompare(String(b.pago.paid_date)))
    if (!cuotas.length) { sinCuota += retiros.length; continue }
    // emparejado cronologico: cada retiro toma la primera cuota pagada en o
    // despues de su fecha que no este ya tomada
    const usadas = new Set<string>()
    for (const r of retiros) {
      const cand = cuotas.filter((c: any) => !usadas.has(String(c.external_id)) && String(c.pago.paid_date) >= String(r.withdrawal_date))
      if (!cand.length) { ambiguos++; continue }
      const c = cand[0]
      usadas.add(String(c.external_id))
      plan.push({ retiro: r, cuota: c })
    }
  }
  console.log(`emparejados sin ambiguedad: ${plan.length} | sin cuota pagada posterior: ${ambiguos} | sin ninguna cuota re-entry: ${sinCuota}`)
  console.log('')
  for (const p of plan.slice(0, 20))
    console.log(`   ${String(nom.get(String(p.retiro.student_id))).slice(0,26).padEnd(27)} | IW ${p.retiro.resolution_number ?? p.retiro.withdrawal_date} (${p.retiro.withdrawal_date}) <- ${p.cuota.pago.transaction_reference ?? 's/ref'} pagada ${p.cuota.pago.paid_date}`)
  if (plan.length > 20) console.log(`   ... y ${plan.length - 20} mas`)
  writeFileSync('C:/BGU_system/bgu-erp/NO_CORRER_deshacer_enlace_reentry.sql',
    `-- Deshacer: quita el enlace Re-entry escrito por el backfill del 20/08/2026.\nBEGIN;\n`
    + `  UPDATE student_withdrawals SET reincorporated_at = NULL, reincorporated_charge_external_id = NULL WHERE id IN (\n`
    + plan.map(p => `    '${p.retiro.id}'`).join(',\n') + `\n  );\nCOMMIT;\n`)
  console.log(''); console.log('deshacer escrito')
  if (!APLICAR) { console.log('ENSAYO EN SECO'); return }
  let ok = 0
  for (const p of plan) {
    const { error } = await sb.from('student_withdrawals').update({
      reincorporated_at: String(p.cuota.pago.paid_date).slice(0, 10),
      reincorporated_charge_external_id: String(p.cuota.external_id),
    }).eq('id', p.retiro.id)
    if (error) throw new Error(`${p.retiro.id}: ${error.message}`)
    ok++
  }
  const { data: v } = await sb.from('student_withdrawals').select('id').eq('type', 'IW').eq('status', 'reincorporado').is('reincorporated_charge_external_id', null)
  console.log(`APLICADOS ${ok} | IW reincorporados que quedan sin enlace: ${(v ?? []).length}`)
})()
