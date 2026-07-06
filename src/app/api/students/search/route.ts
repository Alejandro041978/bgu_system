import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// GET ?q= → busca estudiantes por nombre / documento / correo
export async function GET(req: NextRequest) {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ students: [] })

  const like = q.replace(/[%,]/g, '')
  const { data } = await db().from('academic_students')
    .select('id, first_name, last_name, second_last_name, document_number, email')
    .eq('disabled', false)
    .or(`first_name.ilike.%${like}%,last_name.ilike.%${like}%,second_last_name.ilike.%${like}%,document_number.ilike.%${like}%,email.ilike.%${like}%`)
    .limit(20)

  const students = (data ?? []).map((s: {
    id: string; first_name: string | null; last_name: string | null; second_last_name: string | null; document_number: string | null; email: string | null
  }) => ({
    id: s.id,
    name: [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' ') || (s.email ?? 'Estudiante'),
    document_number: s.document_number,
    email: s.email,
  }))
  return NextResponse.json({ students })
}
