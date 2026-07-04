import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET ?q=...        → busca estudiantes por nombre o documento (lista distinta)
// GET ?document=... → devuelve las notas de ese estudiante
export async function GET(req: NextRequest) {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const document = req.nextUrl.searchParams.get('document')
  const q = req.nextUrl.searchParams.get('q')?.trim()

  // Notas de un estudiante
  if (document) {
    const { data, error } = await db()
      .from('academic_grades')
      .select('*')
      .eq('document_number', document)
      .order('term_year', { ascending: false })
      .order('term_block', { ascending: false })
      .order('course_code')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ grades: data ?? [] })
  }

  // Búsqueda de estudiantes
  if (q && q.length >= 2) {
    const { data, error } = await db()
      .from('academic_grades')
      .select('document_number, student_name')
      .or(`student_name.ilike.%${q}%,document_number.ilike.%${q}%`)
      .limit(300)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // Distinct por documento
    const seen = new Map<string, string>()
    for (const r of data ?? []) {
      if (r.document_number && !seen.has(r.document_number)) seen.set(r.document_number, r.student_name)
    }
    const students = Array.from(seen.entries())
      .map(([document_number, student_name]) => ({ document_number, student_name }))
      .sort((a, b) => (a.student_name ?? '').localeCompare(b.student_name ?? ''))
      .slice(0, 50)
    return NextResponse.json({ students })
  }

  return NextResponse.json({ students: [] })
}
