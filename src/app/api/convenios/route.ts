import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from('convenios')
    .select('*')
    .order('fecha_suscripcion', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    fecha_suscripcion: string; tipo: string; contraparte: string; pais: string;
    contacto_contraparte?: string; email_contraparte?: string;
    fecha_inicio?: string; fecha_termino?: string;
    oportunidad: string; archivo_url?: string
  }
  if (!body.fecha_suscripcion || !body.tipo || !body.contraparte || !body.pais || !body.oportunidad) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from('convenios')
    .insert({
      fecha_suscripcion: body.fecha_suscripcion,
      tipo: body.tipo,
      contraparte: body.contraparte,
      pais: body.pais,
      contacto_contraparte: body.contacto_contraparte ?? null,
      email_contraparte: body.email_contraparte ?? null,
      fecha_inicio: body.fecha_inicio ?? null,
      fecha_termino: body.fecha_termino ?? null,
      oportunidad: body.oportunidad,
      archivo_url: body.archivo_url ?? null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json() as { id: string }
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db() as any).from('convenios').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
