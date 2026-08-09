import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardStaff } from '@/lib/api-guard'
import {
  estadoVisible, refrescarCalificados, CREDITO_POR_REFERIDO, COSTO_DEGREE, CONCEPTO_DEGREE,
} from '@/lib/referrals'

export const revalidate = 0
export const maxDuration = 120

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todo(sb: any, tabla: string, cols: string): Promise<any[]> {
  const out: unknown[] = []
  for (let d = 0; ; d += 1000) {
    const { data, error } = await sb.from(tabla).select(cols).range(d, d + 999)
    if (error) throw new Error(`${tabla}: ${error.message}`)
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return out as any[]
}

// ---------------------------------------------------------------------------
// Free Degree · hoja de control.
//
// Dos vistas de lo mismo: la fila por referido —para saber quién no se ha
// movido— y el acumulado por estudiante, que es donde se ve el compromiso.
//
// El número que hay que mirar es el crédito GANADO PERO NO APLICADO: es el
// descuento que la universidad ya debe y que todavía no aparece en ningún
// estado de cuenta, porque el estudiante aún no ha pedido su titulación.
// ---------------------------------------------------------------------------
export async function GET() {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado
  const sb = db()
  try { await refrescarCalificados(sb) } catch (e) { console.error('refrescar referidos', e) }

  const [refs, studs, progs, leads, cargos] = await Promise.all([
    todo(sb, 'referrals', 'id, referrer_student_id, first_name, last_name, email, phone_number, program_id, status, lead_id, qualified_at, lead_previo, lead_previo_nota, created_at'),
    todo(sb, 'academic_students', 'id, first_name, last_name, second_last_name, document_number'),
    todo(sb, 'academic_programs', 'id, name'),
    todo(sb, 'sales_leads', 'id, stage, last_contact_at'),
    todo(sb, 'account_charges', 'external_id, student_id, charge_type'),
  ])

  const S = new Map(studs.map(s => [s.id, s]))
  const P = new Map(progs.map(p => [p.id, p.name]))
  const L = new Map(leads.map(l => [l.id, l]))

  // Descuentos Free Degree ya aplicados, por estudiante.
  const degree = cargos.filter(c => c.charge_type === CONCEPTO_DEGREE)
  const aplicadoPor = new Map<string, number>()
  if (degree.length) {
    const ids = degree.map(c => c.external_id)
    const pagos: { charge_external_id: string; amount: number; series_code: string | null; transaction_reference: string | null }[] = []
    for (let i = 0; i < ids.length; i += 300) {
      const { data } = await sb.from('account_payments')
        .select('charge_external_id, amount, series_code, transaction_reference').in('charge_external_id', ids.slice(i, i + 300))
      pagos.push(...(data ?? []))
    }
    const dueño = new Map(degree.map(c => [c.external_id, c.student_id]))
    for (const p of pagos) {
      if (p.series_code !== 'DESCUENTO' || !/free degree/i.test(String(p.transaction_reference ?? ''))) continue
      const sid = dueño.get(p.charge_external_id)
      if (sid) aplicadoPor.set(sid, (aplicadoPor.get(sid) ?? 0) + Number(p.amount ?? 0))
    }
  }

  const filas = refs.map(r => {
    const s = S.get(r.referrer_student_id)
    const lead = r.lead_id ? L.get(r.lead_id) ?? null : null
    const estado = estadoVisible(r, lead)
    return {
      id: r.id,
      referente: s ? [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' ').replace(/\s+/g, ' ') : '—',
      referente_id: r.referrer_student_id,
      documento: s?.document_number ?? null,
      referido: [r.first_name, r.last_name].filter(Boolean).join(' '),
      email: r.email, telefono: r.phone_number,
      programa: r.program_id ? P.get(r.program_id) ?? null : null,
      estado,
      etapa_lead: lead?.stage ?? null,
      lead_previo: !!r.lead_previo,
      lead_previo_nota: r.lead_previo_nota ?? null,
      dias: Math.floor((Date.now() - new Date(lead?.last_contact_at ?? r.created_at).getTime()) / 86400000),
      creado: r.created_at,
      qualified_at: r.qualified_at,
    }
  }).sort((a, b) => String(b.creado).localeCompare(String(a.creado)))

  // Acumulado por estudiante
  const porEstudiante = new Map<string, { referente: string; documento: string | null; total: number; inscritos: number; ganado: number; aplicado: number; disponible: number }>()
  for (const f of filas) {
    const e = porEstudiante.get(f.referente_id) ?? {
      referente: f.referente, documento: f.documento, total: 0, inscritos: 0, ganado: 0, aplicado: 0, disponible: 0,
    }
    e.total++
    if (f.estado === 'inscrito') e.inscritos++
    porEstudiante.set(f.referente_id, e)
  }
  for (const [sid, e] of porEstudiante) {
    e.ganado = e.inscritos * CREDITO_POR_REFERIDO
    e.aplicado = Math.round((aplicadoPor.get(sid) ?? 0) * 100) / 100
    e.disponible = Math.max(0, Math.round((e.ganado - e.aplicado) * 100) / 100)
  }

  const inscritos = filas.filter(f => f.estado === 'inscrito').length
  return NextResponse.json({
    resumen: {
      referidos: filas.length,
      inscritos,
      del_equipo: filas.filter(f => f.estado === 'del_equipo').length,
      rescatados: filas.filter(f => f.lead_previo && f.estado !== 'del_equipo').length,
      conversion: filas.length ? Math.round((inscritos / filas.length) * 1000) / 10 : 0,
      ganado: inscritos * CREDITO_POR_REFERIDO,
      aplicado: [...porEstudiante.values()].reduce((s, e) => s + e.aplicado, 0),
      comprometido: [...porEstudiante.values()].reduce((s, e) => s + e.disponible, 0),
      costo_degree: COSTO_DEGREE,
    },
    filas,
    estudiantes: [...porEstudiante.entries()].map(([id, e]) => ({ student_id: id, ...e }))
      .sort((a, b) => b.inscritos - a.inscritos || b.total - a.total),
  })
}
