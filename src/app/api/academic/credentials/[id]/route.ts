import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// DELETE → borra la evaluación completa: archivos en storage + registro (reporte,
// documentación y estado). El docente vuelve a "pendiente / sin credencial".
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin() as any

  const { data: cred } = await db.from('faculty_credentials').select('employee_id').eq('id', id).single()
  if (cred?.employee_id) {
    const folder = `credentials/${cred.employee_id}`
    const { data: files } = await db.storage.from('contracts').list(folder)
    if (files?.length) {
      await db.storage.from('contracts').remove(files.map((f: { name: string }) => `${folder}/${f.name}`))
    }
  }

  const { error } = await db.from('faculty_credentials').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
