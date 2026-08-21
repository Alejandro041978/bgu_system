import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isStudentUser } from '@/lib/student-identity'
import { puedeEditarPagina } from '@/lib/api-guard'
import { rebillEnrollment } from '@/lib/billing'

export const revalidate = 0
export const maxDuration = 60

// POST → cambia de una sola vez el plan de cuotas de una matrícula.
//   dry_run: true  → vista previa (qué se borra, qué se conserva, qué se crea)
//   dry_run: false → lo aplica
//
// Reescribe el libro de cuotas. Lo puede hacer el superadmin y cualquier rol
// con permiso de EDITAR Estado de cuenta (academic_account): antes exigía
// superadmin a secas y el permiso por rol no servía de nada (21/08/2026).
export async function POST(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  // Un estudiante tiene sesión y no tiene ficha: se rechaza explícitamente antes.
  if (await isStudentUser(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  if (!(await puedeEditarPagina(user, 'academic_account'))) {
    return NextResponse.json({ error: 'Refacturar cuotas requiere permiso de edición en Estado de cuenta' }, { status: 403 })
  }

  const b = await req.json().catch(() => null) as {
    enrollment_id?: string; concept?: number | string | null
    installments_count?: number; installment_amount?: number
    first_due_date?: string; due_day?: number | string | null
    dry_run?: boolean; allow_total_change?: boolean
  } | null
  if (!b?.enrollment_id) return NextResponse.json({ error: 'Falta la matrícula' }, { status: 400 })

  const res = await rebillEnrollment({
    enrollmentId: b.enrollment_id,
    plan: {
      concept: b.concept === '' || b.concept == null ? null : Number(b.concept),
      installmentsCount: Number(b.installments_count) || 0,
      installmentAmount: Number(b.installment_amount) || 0,
      firstDueDate: String(b.first_due_date ?? ''),
      dueDay: b.due_day === '' || b.due_day == null ? null : Number(b.due_day),
    },
    apply: b.dry_run === false,
    allowTotalChange: !!b.allow_total_change,
  })

  // El bloqueo no es un error del servidor: es una decisión que el usuario tiene
  // que tomar. Va con 200 y el detalle, para que la UI lo muestre completo.
  if (!res.ok && !res.blocked) return NextResponse.json(res, { status: 400 })
  return NextResponse.json(res)
}
