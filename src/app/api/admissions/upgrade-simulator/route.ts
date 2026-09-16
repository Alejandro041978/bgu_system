import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardPagina } from '@/lib/page-guard'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { departamentos, buscarInstitutos, institutoConCarreras, simular } from '@/lib/upgrade-simulator-server'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const FAMILIAS = ['contabilidad', 'administracion', 'afin', 'no_afin', 'sin_clasificar']

// ---------------------------------------------------------------------------
// API INTERNA del simulador Upgrade: el mismo motor que la pública, más el
// mantenimiento del catálogo de carreras (donde vive la regla) y la bandeja
// de interesados. Permiso de página admissions_upgrade_simulator: ver =
// simular y leer; editar = clasificar carreras y atender interesados.
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const noAutorizado = await guardPagina('admissions_upgrade_simulator', 'view')
  if (noAutorizado) return noAutorizado
  const sb = db()
  const p = req.nextUrl.searchParams
  const view = p.get('view')

  if (view === 'careers') {
    const { data } = await sb.from('upgrade_careers').select('*').order('n_programas', { ascending: false }).order('nombre')
    const { count: institutos } = await sb.from('upgrade_institutes').select('codigo_modular', { head: true, count: 'exact' })
    const { count: licenciados } = await sb.from('upgrade_institutes').select('codigo_modular', { head: true, count: 'exact' }).eq('licenciado', true)
    return NextResponse.json({ carreras: data ?? [], institutos: institutos ?? 0, licenciados: licenciados ?? 0 })
  }
  if (view === 'leads') {
    const { data } = await sb.from('upgrade_simulator_leads').select('*').order('created_at', { ascending: false }).limit(300)
    return NextResponse.json({ leads: data ?? [] })
  }
  if (p.get('departamentos') === '1') return NextResponse.json({ departamentos: await departamentos(sb) })
  const codigo = p.get('codigo')
  if (codigo) {
    const r = await institutoConCarreras(sb, codigo.slice(0, 20))
    if (!r.instituto) return NextResponse.json({ error: 'Instituto no encontrado' }, { status: 404 })
    return NextResponse.json(r)
  }
  const q = String(p.get('q') ?? '').slice(0, 80)
  const dep = p.get('departamento')
  return NextResponse.json({ institutos: await buscarInstitutos(sb, q, dep && dep !== '' ? dep : null) })
}

export async function POST(req: NextRequest) {
  const noAutorizado = await guardPagina('admissions_upgrade_simulator', 'view')
  if (noAutorizado) return noAutorizado
  const b = await req.json().catch(() => null) as {
    codigo_modular?: string; carrera_key?: string; carrera_texto?: string
    nombre?: string; whatsapp?: string; email?: string
  } | null
  if (!b?.codigo_modular) return NextResponse.json({ error: 'Falta el instituto' }, { status: 400 })
  if (!b.carrera_key && !String(b.carrera_texto ?? '').trim()) return NextResponse.json({ error: 'Indica la carrera' }, { status: 400 })
  const r = await simular(db(), {
    codigo_modular: String(b.codigo_modular).slice(0, 20),
    carrera_key: b.carrera_key ?? null, carrera_texto: b.carrera_texto ?? null,
    nombre: b.nombre ?? null, whatsapp: b.whatsapp ?? null, email: b.email ?? null,
    origen: 'erp',
  })
  return NextResponse.json(r)
}

// PATCH { carrera_key, familia?, califica_admin?, califica_conta?, revisado?, nota? }
// PATCH { lead_id, atendido: true, nota? }
export async function PATCH(req: NextRequest) {
  const noAutorizado = await guardPagina('admissions_upgrade_simulator')
  if (noAutorizado) return noAutorizado
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  const b = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!b) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  const sb = db()

  if (typeof b.lead_id === 'string') {
    const { error } = await sb.from('upgrade_simulator_leads')
      .update({ atendido_at: b.atendido ? new Date().toISOString() : null, atendido_by: b.atendido ? (user?.email ?? null) : null, nota: typeof b.nota === 'string' ? b.nota : undefined })
      .eq('id', b.lead_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (typeof b.carrera_key !== 'string') return NextResponse.json({ error: 'Falta carrera_key' }, { status: 400 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: any = { updated_at: new Date().toISOString(), updated_by: user?.email ?? null }
  if (typeof b.familia === 'string') {
    if (!FAMILIAS.includes(b.familia)) return NextResponse.json({ error: 'Familia inválida' }, { status: 400 })
    patch.familia = b.familia
  }
  if (typeof b.califica_admin === 'boolean') patch.califica_admin = b.califica_admin
  if (typeof b.califica_conta === 'boolean') patch.califica_conta = b.califica_conta
  if (typeof b.revisado === 'boolean') patch.revisado = b.revisado
  if (typeof b.nota === 'string') patch.nota = b.nota.trim() || null
  // Clasificar a mano = revisar
  if (patch.familia !== undefined || patch.califica_admin !== undefined || patch.califica_conta !== undefined) patch.revisado = b.revisado === false ? false : true
  const { error } = await sb.from('upgrade_careers').update(patch).eq('carrera_key', b.carrera_key)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
