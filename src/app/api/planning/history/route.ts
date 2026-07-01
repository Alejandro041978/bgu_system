import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const LEVELS: Record<string, { table: string; parentField: string }> = {
  dimension: { table: 'strategic_dimensions', parentField: 'cycle_id' },
  objective: { table: 'strategic_objectives', parentField: 'dimension_id' },
  strategy: { table: 'strategic_strategies', parentField: 'objective_id' },
  action: { table: 'strategic_actions', parentField: 'strategy_id' },
}

// Elimina una versión superseded del historial (no permite borrar versiones activas)
export async function DELETE(req: NextRequest) {
  const { id, level } = await req.json() as { id: string; level: string }
  const conf = LEVELS[level]
  if (!conf || !id) return NextResponse.json({ error: 'id y level requeridos' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = db() as any
  const { error, count } = await sb.from(conf.table).delete({ count: 'exact' }).eq('id', id).neq('status', 'active')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (count === 0) return NextResponse.json({ error: 'No se puede eliminar: la versión está activa o no existe' }, { status: 400 })
  return NextResponse.json({ ok: true })
}

// Devuelve todas las versiones (activas y superadas) de una entidad, identificada
// por su código dentro de un mismo padre, ordenadas cronológicamente.
export async function GET(req: NextRequest) {
  const level = req.nextUrl.searchParams.get('level') ?? ''
  const parentId = req.nextUrl.searchParams.get('parent_id')
  const code = req.nextUrl.searchParams.get('code')
  const conf = LEVELS[level]
  if (!conf || !parentId || !code) return NextResponse.json({ error: 'level, parent_id y code requeridos' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from(conf.table)
    .select('id, code, name, description, valid_from_year, valid_to_year, status, change_reason, supersedes_id, created_at')
    .eq(conf.parentField, parentId)
    .eq('code', code)
    .order('valid_from_year', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
