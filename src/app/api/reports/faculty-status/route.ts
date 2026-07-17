import { NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Reporte "Estado de los docentes".
//
// Docente = hr_employees.is_faculty. Los contratos (contract_instances) son de
// TODO el personal, así que aquí se filtran a los de docentes; un contrato
// cuenta para un año académico si su vigencia [start_date, end_date] se solapa
// con la del año. Solo los firmados cuentan como "con contrato"; los enviados
// sin firmar se muestran aparte como "en firma". Un contrato firmado sin
// fechas no se puede atribuir a ningún año: se reporta para corregirlo.
export async function GET() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sb = db()
  const [{ data: emps }, { data: creds }, { data: years }, { data: contracts }] = await Promise.all([
    sb.from('hr_employees').select('id, full_name, is_faculty'),
    sb.from('faculty_credentials').select('employee_id, status, approved_level'),
    sb.from('academic_years').select('id, name, start_date, end_date').order('start_date', { ascending: false }),
    sb.from('contract_instances').select('signer_ref_id, signer_name, status, start_date, end_date'),
  ])

  const faculty = ((emps ?? []) as { id: string; full_name: string | null; is_faculty: boolean | null }[]).filter(e => e.is_faculty)
  const facultyIds = new Set(faculty.map(f => f.id))

  // --- Credenciales ---
  const credOf = new Map<string, { status: string | null; approved_level: string | null }>()
  for (const c of (creds ?? []) as { employee_id: string; status: string | null; approved_level: string | null }[]) {
    credOf.set(c.employee_id, c)
  }
  let aprobados = 0, enRevision = 0, sinExpediente = 0
  const porNivel = new Map<string, number>()
  for (const f of faculty) {
    const c = credOf.get(f.id)
    if (!c) { sinExpediente++; continue }
    if (c.status === 'approved') {
      aprobados++
      const lvl = c.approved_level ?? '(sin nivel)'
      porNivel.set(lvl, (porNivel.get(lvl) ?? 0) + 1)
    } else enRevision++
  }

  // --- Contratos de docentes ---
  type Contract = { signer_ref_id: string | null; signer_name: string | null; status: string | null; start_date: string | null; end_date: string | null }
  const facultyContracts = ((contracts ?? []) as Contract[]).filter(c => c.signer_ref_id && facultyIds.has(c.signer_ref_id))
  const firmadosSinFechas = facultyContracts
    .filter(c => c.status === 'signed' && (!c.start_date || !c.end_date))
    .map(c => c.signer_name ?? c.signer_ref_id)

  const overlaps = (c: Contract, y: { start_date: string | null; end_date: string | null }): boolean => {
    if (!c.start_date || !c.end_date || !y.start_date || !y.end_date) return false
    return c.start_date <= y.end_date && c.end_date >= y.start_date
  }

  const porAno = ((years ?? []) as { id: string; name: string; start_date: string | null; end_date: string | null }[]).map(y => {
    const conContrato = new Set<string>()
    const enFirma = new Set<string>()
    for (const c of facultyContracts) {
      if (!overlaps(c, y)) continue
      if (c.status === 'signed') conContrato.add(c.signer_ref_id!)
      else enFirma.add(c.signer_ref_id!)
    }
    for (const id of conContrato) enFirma.delete(id)
    return {
      year: y.name,
      start_date: y.start_date, end_date: y.end_date,
      con_contrato: conContrato.size,
      en_firma: enFirma.size,
      sin_contrato: faculty.length - conContrato.size,
    }
  })

  return NextResponse.json({
    total_docentes: faculty.length,
    credenciales: {
      aprobados, en_revision: enRevision, sin_expediente: sinExpediente,
      por_nivel: Object.fromEntries([...porNivel.entries()].sort()),
    },
    contratos_por_ano: porAno,
    firmados_sin_fechas: firmadosSinFechas,
  })
}
