import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardStaff } from '@/lib/api-guard'
import { moodleConfigured, moodleUserState } from '@/lib/moodle'
import { lastLoginByEmail, googleConfigured } from '@/lib/google-workspace'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todo(sb: any, tabla: string, cols: string): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from(tabla).select(cols).range(from, from + 999)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

// ---------------------------------------------------------------------------
// Relación de Deudores — quiénes deben algo YA VENCIDO, por cualquier concepto.
//
// El Reporte de Deuda cuenta 834 deudores y se queda con el número: calcula el
// saldo de cada estudiante y descarta el detalle al agregar. Para saber a quién
// llamar había que ir uno por uno en el Estado de Cuenta, sabiendo de antemano
// a quién buscar.
//
// Es deuda VENCIDA y de cualquier concepto, que es una vara distinta de la del
// restrictor de Moodle —ése mira solo matrícula y excluye campus socio, porque
// responde a otra pregunta: a quién cortarle el aula, no a quién cobrarle—.
//
// Exige categoría: sin filtro son cientos de filas y, sobre todo, dos consultas
// externas (Moodle y Google) que no tienen sentido lanzar sobre todo el padrón
// para mirar una sola división.
//
// GET ?category=<id|SIN>
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const categoria = (req.nextUrl.searchParams.get('category') ?? '').trim()
  const sb = db()

  // Catálogo de categorías: se devuelve siempre, para poblar el selector.
  const cats = await todo(sb, 'academic_programs_category', 'id, name')
  const categorias = [...cats]
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .concat([{ id: 'SIN', name: 'Sin categoría' }])

  if (!categoria) return NextResponse.json({ categorias, filas: null })

  const hoy = new Date().toISOString().slice(0, 10)

  // Saldo vencido por estudiante. Vencido = con fecha de vencimiento pasada.
  // Las cuotas SIN fecha se consideran exigibles, igual que en el Reporte de
  // Deuda: una cuota sin vencimiento no es una cuota futura, es una que nadie
  // fechó.
  const charges = await todo(sb, 'account_charges', 'external_id, student_id, amount, due_date, concept')
  const pagos = await todo(sb, 'account_payments', 'charge_external_id, amount')
  const pagado = new Map<string, number>()
  for (const p of pagos) {
    if (!p.charge_external_id) continue
    pagado.set(String(p.charge_external_id), (pagado.get(String(p.charge_external_id)) ?? 0) + Number(p.amount || 0))
  }

  const vencidoDe = new Map<string, number>()
  const cuotasDe = new Map<string, number>()
  const masAntigua = new Map<string, string>()
  for (const c of charges) {
    if (!c.student_id) continue
    if (c.due_date && String(c.due_date) > hoy) continue
    const saldo = Number(c.amount || 0) - (pagado.get(String(c.external_id)) ?? 0)
    if (saldo <= 0.005) continue
    const id = String(c.student_id)
    vencidoDe.set(id, (vencidoDe.get(id) ?? 0) + saldo)
    cuotasDe.set(id, (cuotasDe.get(id) ?? 0) + 1)
    const f = c.due_date ? String(c.due_date) : '0000-00-00'
    if (!masAntigua.has(id) || f < masAntigua.get(id)!) masAntigua.set(id, f)
  }
  if (!vencidoDe.size) return NextResponse.json({ categorias, filas: [], total: 0 })

  // Programa y categoría del estudiante: por su matrícula. Si tuviera varias,
  // se listan todas — es información para quien va a llamar, no una clave.
  const programas = await todo(sb, 'academic_programs', 'id, name, category_id')
  const progInfo = new Map(programas.map(p => [String(p.id), p]))
  const enrolls = await todo(sb, 'academic_student_enrollments', 'student_id, program_id')
  const progsDe = new Map<string, string[]>()
  for (const e of enrolls) {
    if (!e.student_id || !e.program_id) continue
    const k = String(e.student_id)
    const lista = progsDe.get(k) ?? []
    if (!lista.includes(String(e.program_id))) lista.push(String(e.program_id))
    progsDe.set(k, lista)
  }

  const enCategoria = (studentId: string): boolean => {
    const progs = progsDe.get(studentId) ?? []
    if (categoria === 'SIN') return progs.every(p => !progInfo.get(p)?.category_id)
    return progs.some(p => String(progInfo.get(p)?.category_id ?? '') === categoria)
  }

  const ids = [...vencidoDe.keys()].filter(enCategoria)
  if (!ids.length) return NextResponse.json({ categorias, filas: [], total: 0 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const studs: any[] = []
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await sb.from('academic_students')
      .select('id, first_name, last_name, second_last_name, document_number, email, email_alt, phone_number, moodle_user_id, situation')
      .in('id', ids.slice(i, i + 300))
    studs.push(...(data ?? []))
  }

  // Los dos "últimos accesos" salen de fuera del ERP, y ninguno es obligatorio:
  // si Moodle o Google no responden, la columna dice "sin dato" en vez de
  // tumbar el reporte. Un dato ausente es una respuesta; un error 500 no.
  const moodleIds = studs.map(s => Number(s.moodle_user_id)).filter(n => Number.isFinite(n) && n > 0)
  const [estadoMoodle, loginCorreo] = await Promise.all([
    moodleConfigured() && moodleIds.length
      ? moodleUserState(moodleIds).catch(() => new Map<number, { suspended: boolean; lastaccess: number }>())
      : Promise.resolve(new Map<number, { suspended: boolean; lastaccess: number }>()),
    lastLoginByEmail(),
  ])

  const filas = studs.map(s => {
    const id = String(s.id)
    const progs = (progsDe.get(id) ?? []).map(p => progInfo.get(p)?.name).filter(Boolean)
    const mo = s.moodle_user_id ? estadoMoodle.get(Number(s.moodle_user_id)) : undefined
    const inst = s.email_alt ? String(s.email_alt).toLowerCase() : null
    return {
      student_id: id,
      nombre: [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' '),
      documento: s.document_number ?? null,
      deuda_vencida: Math.round((vencidoDe.get(id) ?? 0) * 100) / 100,
      cuotas_vencidas: cuotasDe.get(id) ?? 0,
      // La cuota más antigua sin pagar: es lo que ordena a quién llamar primero.
      vencida_desde: (masAntigua.get(id) ?? '') === '0000-00-00' ? null : (masAntigua.get(id) ?? null),
      programa: progs.join(' · ') || '—',
      situacion: s.situation ?? null,
      email_personal: s.email ?? null,
      email_institucional: s.email_alt ?? null,
      telefono: s.phone_number ?? null,
      // lastaccess de Moodle viene en segundos epoch; 0 = nunca entró.
      ultimo_acceso_campus: mo?.lastaccess ? new Date(mo.lastaccess * 1000).toISOString() : null,
      campus_suspendido: mo ? mo.suspended : null,
      ultimo_acceso_correo: inst ? (loginCorreo.get(inst) ?? null) : null,
      correo_en_directorio: inst ? loginCorreo.has(inst) : false,
    }
  }).sort((a, b) => b.deuda_vencida - a.deuda_vencida)

  return NextResponse.json({
    categorias,
    filas,
    total: filas.length,
    suma_vencida: Math.round(filas.reduce((s, f) => s + f.deuda_vencida, 0) * 100) / 100,
    fuentes: {
      moodle: moodleConfigured(),
      correo: googleConfigured() && loginCorreo.size > 0,
    },
  })
}
