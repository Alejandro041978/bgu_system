import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const convenioId = req.nextUrl.searchParams.get('convenio_id')
  if (!convenioId) return NextResponse.json({ error: 'convenio_id requerido' }, { status: 400 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from('convenio_matriculas')
    .select('*')
    .eq('convenio_id', convenioId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    convenio_id: string; nombre: string;
    documento_identidad?: string; carrera?: string;
    periodo?: string; estado?: string;
    fecha_matricula?: string; observaciones?: string
  }
  if (!body.convenio_id || !body.nombre) {
    return NextResponse.json({ error: 'convenio_id y nombre son requeridos' }, { status: 400 })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from('convenio_matriculas')
    .insert({
      convenio_id: body.convenio_id,
      nombre: body.nombre,
      documento_identidad: body.documento_identidad ?? null,
      carrera: body.carrera ?? null,
      periodo: body.periodo ?? null,
      estado: body.estado ?? 'activo',
      fecha_matricula: body.fecha_matricula ?? null,
      observaciones: body.observaciones ?? null,
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
  const { error } = await (db() as any).from('convenio_matriculas').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
