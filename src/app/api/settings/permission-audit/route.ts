import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardStaff } from '@/lib/api-guard'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// Qué habría bloqueado el permiso de página.
//
// Es la lista con la que se corrigen los roles ANTES de poner el modo
// estricto. Cada fila dice: este rol, en esta página, intentó esta acción N
// veces. Si la acción es legítima —y casi todas lo serán, porque la gente
// lleva meses trabajando así— el arreglo es marcar la casilla, no quitarle el
// trabajo a nadie.
//
// GET ?dias=7
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const noAutorizado = await guardStaff(); if (noAutorizado) return noAutorizado

  const dias = Math.min(Math.max(Number(req.nextUrl.searchParams.get('dias') ?? 7), 1), 90)
  const desde = new Date(Date.now() - dias * 864e5).toISOString()
  const sb = db()

  const { data, error } = await sb.from('permission_audit')
    .select('role_name, role_id, page_key, accion, email, ruta, bloqueado, at')
    .gte('at', desde).order('at', { ascending: false }).limit(5000)
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) {
      return NextResponse.json({ error: 'Falta correr supabase/role_permissions_delete.sql' }, { status: 400 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const filas = (data ?? []) as {
    role_name: string | null; role_id: string; page_key: string; accion: string
    email: string | null; ruta: string; bloqueado: boolean; at: string
  }[]

  const grupos = new Map<string, {
    role_id: string; rol: string; page_key: string; accion: string
    intentos: number; personas: Set<string>; ultima: string; rutas: Set<string>; bloqueado: boolean
  }>()
  for (const f of filas) {
    const k = `${f.role_id}|${f.page_key}|${f.accion}`
    if (!grupos.has(k)) {
      grupos.set(k, {
        role_id: f.role_id, rol: f.role_name ?? '(sin nombre)', page_key: f.page_key, accion: f.accion,
        intentos: 0, personas: new Set(), ultima: f.at, rutas: new Set(), bloqueado: f.bloqueado,
      })
    }
    const g = grupos.get(k)!
    g.intentos++
    if (f.email) g.personas.add(f.email)
    if (f.ruta) g.rutas.add(f.ruta)
    if (f.at > g.ultima) g.ultima = f.at
    if (f.bloqueado) g.bloqueado = true
  }

  const resumen = [...grupos.values()]
    .map(g => ({
      role_id: g.role_id, rol: g.rol, page_key: g.page_key, accion: g.accion,
      intentos: g.intentos, personas: [...g.personas], ultima: g.ultima,
      rutas: [...g.rutas].slice(0, 4), bloqueado: g.bloqueado,
    }))
    .sort((a, b) => b.intentos - a.intentos)

  return NextResponse.json({
    modo: process.env.PERMISOS_MODO === 'estricto' ? 'estricto' : 'auditoria',
    dias, eventos: filas.length, resumen,
  })
}
