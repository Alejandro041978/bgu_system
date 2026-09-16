import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { departamentos, buscarInstitutos, institutoConCarreras, simular } from '@/lib/upgrade-simulator-server'
import { carreraKey } from '@/lib/upgrade-simulator'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// API PÚBLICA del simulador Upgrade (bajo /api/form/*: sin sesión). Solo
// lectura de institutos/carreras (sin datos de contacto de institutos) y el
// registro de la simulación con el contacto voluntario del interesado.
// ---------------------------------------------------------------------------
const TEL = /^\+\d{7,15}$/

export async function GET(req: NextRequest) {
  const sb = db()
  const p = req.nextUrl.searchParams
  if (p.get('departamentos') === '1') return NextResponse.json({ departamentos: await departamentos(sb) })
  // Diagnóstico inocuo: cómo normaliza ESTE runtime un nombre de carrera
  const normaliza = p.get('normaliza')
  if (normaliza != null) return NextResponse.json({ entrada: normaliza.slice(0, 120), clave: carreraKey(normaliza.slice(0, 120)) })
  const codigo = p.get('codigo')
  if (codigo) {
    const r = await institutoConCarreras(sb, codigo.slice(0, 20))
    if (!r.instituto) return NextResponse.json({ error: 'Instituto no encontrado' }, { status: 404 })
    return NextResponse.json(r)
  }
  const q = String(p.get('q') ?? '').slice(0, 80)
  const dep = p.get('departamento')
  const page = Number(p.get('page') ?? 1)
  return NextResponse.json(await buscarInstitutos(sb, q, dep && dep !== '' ? dep : null, Number.isFinite(page) ? page : 1))
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null) as {
    codigo_modular?: string; carrera_key?: string; carrera_texto?: string
    nombre?: string; whatsapp?: string; email?: string
  } | null
  if (!b?.codigo_modular) return NextResponse.json({ error: 'Falta el instituto' }, { status: 400 })
  if (!b.carrera_key && !String(b.carrera_texto ?? '').trim()) return NextResponse.json({ error: 'Indica tu carrera' }, { status: 400 })
  if (b.whatsapp && !TEL.test(String(b.whatsapp))) return NextResponse.json({ error: 'WhatsApp inválido (código de país + número)' }, { status: 400 })
  const r = await simular(db(), {
    codigo_modular: String(b.codigo_modular).slice(0, 20),
    carrera_key: b.carrera_key ? String(b.carrera_key).slice(0, 200) : null,
    carrera_texto: b.carrera_texto ? String(b.carrera_texto).slice(0, 200) : null,
    nombre: b.nombre ? String(b.nombre).slice(0, 120) : null,
    whatsapp: b.whatsapp ? String(b.whatsapp) : null,
    email: b.email ? String(b.email).slice(0, 160) : null,
    origen: 'publico',
  })
  return NextResponse.json({ veredicto: r.veredicto, instituto: r.instituto ? { nombre: r.instituto.nombre, licenciado: r.instituto.licenciado } : null, carrera: r.carrera ? { nombre: r.carrera.nombre } : null })
}
