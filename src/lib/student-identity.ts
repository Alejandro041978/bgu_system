import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export interface StudentIdentity {
  document_number: string | null
  email: string | null
  name: string
  impersonating: boolean
}

/** Superadmin = usuario sin registro en hr_employees o sin role_id. */
export async function isSuperadmin(userId: string): Promise<boolean> {
  const { data: emp } = await admin().from('hr_employees').select('role_id').eq('user_id', userId).maybeSingle()
  return !emp?.role_id
}

function fullName(r: { first_name?: string; last_name?: string; second_last_name?: string } | null): string {
  if (!r) return ''
  return [r.first_name, r.last_name, r.second_last_name].filter(Boolean).join(' ')
}

/**
 * Resuelve la identidad de estudiante efectiva para el portal:
 * - Si el correo de login está en academic_students → estudiante real.
 * - Si no lo está y es superadmin con impersonación activa (cookie) → ese estudiante.
 * - En otro caso → null.
 */
export async function getEffectiveStudent(user: { id: string; email?: string } | null): Promise<StudentIdentity | null> {
  if (!user) return null
  const sb = admin()

  if (user.email) {
    const { data } = await sb.from('academic_students')
      .select('document_number, email, first_name, last_name, second_last_name')
      .eq('email', user.email).eq('disabled', false).maybeSingle()
    if (data) return { document_number: data.document_number, email: data.email, name: fullName(data), impersonating: false }
  }

  const cookieStore = await cookies()
  const doc = cookieStore.get('imp_student')?.value
  if (doc && await isSuperadmin(user.id)) {
    const { data } = await sb.from('academic_students')
      .select('document_number, email, first_name, last_name, second_last_name')
      .eq('document_number', doc).maybeSingle()
    if (data) return { document_number: data.document_number, email: data.email, name: fullName(data), impersonating: true }
    const { data: g } = await sb.from('academic_grades')
      .select('document_number, email, student_name').eq('document_number', doc).limit(1).maybeSingle()
    if (g) return { document_number: g.document_number, email: g.email, name: g.student_name, impersonating: true }
  }

  return null
}
