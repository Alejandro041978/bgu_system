import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardStaff } from '@/lib/api-guard'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Nombres legibles de los campos. Los que no estén salen con su nombre técnico:
// es preferible a esconderlos, porque el historial sirve justamente para ver lo
// que nadie previó.
const ETIQUETA: Record<string, string> = {
  email: 'Correo personal', email_alt: 'Correo institucional',
  first_name: 'Nombres', last_name: 'Primer apellido', second_last_name: 'Segundo apellido',
  document_number: 'Documento', document_type: 'Tipo de documento',
  phone_number: 'Teléfono', phone_code: 'Código telefónico', phone_local: 'Número telefónico',
  situation: 'Situación', situation_source: 'Origen de la situación',
  withdrawal_date: 'Fecha de retiro', withdrawal_resolution: 'Resolución de retiro',
  disabled: 'Deshabilitado', country: 'País', birth_country: 'País de nacimiento',
  city: 'Ciudad', date_of_birth: 'Fecha de nacimiento',
  moodle_user_id: 'Usuario Moodle', moodle_suspended: 'Moodle suspendido',
  moodle_no_account: 'Sin cuenta Moodle', external_id: 'Id SystemActiva',
}

// GET ?student_id=  → historial de una ficha
// GET ?field=email  → todos los cambios de un campo (para revisar un incidente)
// GET               → los últimos cambios de todo el ERP
export async function GET(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const sb = db()
  const studentId = req.nextUrl.searchParams.get('student_id')
  const field = req.nextUrl.searchParams.get('field')
  const limite = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 200), 1000)

  let q = sb.from('student_audit').select('*').order('changed_at', { ascending: false }).limit(limite)
  if (studentId) q = q.eq('student_id', studentId)
  if (field) q = q.eq('field', field)

  const { data, error } = await q
  if (error) {
    // Si aún no se corrió student_audit.sql, decirlo con todas las letras: un
    // historial vacío se lee como "nadie tocó nada", que es lo contrario de lo
    // que pasa.
    if (error.code === '42P01') {
      return NextResponse.json({ error: 'Falta correr supabase/student_audit.sql: el registro de cambios todavía no existe.' }, { status: 400 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Resolver el correo de quien lo hizo cuando el disparador no pudo.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filas = (data ?? []) as any[]
  const faltan = [...new Set(filas.filter(f => f.changed_by && !f.changed_by_email).map(f => String(f.changed_by)))]
  const correos = new Map<string, string>()
  for (const id of faltan) {
    const { data: u } = await sb.auth.admin.getUserById(id)
    if (u?.user?.email) correos.set(id, u.user.email)
  }

  return NextResponse.json({
    total: filas.length,
    cambios: filas.map(f => ({
      ...f,
      etiqueta: f.field === '*' ? (f.action === 'insert' ? 'Ficha creada' : 'Ficha borrada') : (ETIQUETA[f.field] ?? f.field),
      autor: f.changed_by_email ?? (f.changed_by ? correos.get(String(f.changed_by)) ?? f.changed_by : null),
      // Sin autor = no salió del ERP: N8N, la consola de Supabase o SQL a mano.
      externo: !f.changed_by,
    })),
  })
}
