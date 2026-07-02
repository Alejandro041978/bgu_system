import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from('capacitaciones')
    .select('*')
    .order('fecha_inicio', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    id_capacitacion: string; fecha_inicio: string; fecha_termino?: string;
    tipo: 'academica' | 'administrativa' | 'tecnologica' | 'etica'; modalidad: string; gestion: string; financiamiento: string;
    tematica?: string; denominacion: string; tipo_programa: string; entidad_capacitadora?: string
  }
  if (!body.id_capacitacion || !body.fecha_inicio || !body.tipo || !body.modalidad ||
      !body.gestion || !body.financiamiento || !body.denominacion || !body.tipo_programa) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from('capacitaciones')
    .insert({
      id_capacitacion: body.id_capacitacion,
      fecha_inicio: body.fecha_inicio,
      fecha_termino: body.fecha_termino ?? null,
      tipo: body.tipo,
      modalidad: body.modalidad,
      gestion: body.gestion,
      financiamiento: body.financiamiento,
      tematica: body.tematica ?? null,
      denominacion: body.denominacion,
      tipo_programa: body.tipo_programa,
      entidad_capacitadora: body.entidad_capacitadora ?? null,
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
  const { error } = await (db() as any).from('capacitaciones').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
