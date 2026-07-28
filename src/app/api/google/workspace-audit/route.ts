import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isStudentUser } from '@/lib/student-identity'
import { googleConfigured, getAccessToken } from '@/lib/google-workspace'

export const revalidate = 0
export const maxDuration = 120

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const norm = (s: string | null | undefined) => String(s ?? '')
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

// Auditoría Workspace ↔ ERP: lista TODOS los buzones @blackwell.pro y los cruza
// contra academic_students.email_alt. Detecta:
//  - buzones SIN REGISTRO en el ERP (creados fuera de registro), con candidato
//    por convención de nombres y último login para decidir;
//  - email_alt del ERP cuyo buzón NO existe en Workspace (registro roto).
export async function GET(req: NextRequest) {
  const byCron = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  if (!byCron) {
    const auth = await createAuthClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    if (await isStudentUser(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  if (!googleConfigured()) return NextResponse.json({ error: 'Google Workspace no está configurado' }, { status: 400 })

  const token = await getAccessToken()
  const domain = process.env.STUDENT_EMAIL_DOMAIN || 'blackwell.pro'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gUsers: any[] = []
  let pageToken = ''
  for (let i = 0; i < 20; i++) {
    const url = `https://admin.googleapis.com/admin/directory/v1/users?domain=${domain}&maxResults=500` +
      `&fields=nextPageToken,users(primaryEmail,name/fullName,creationTime,lastLoginTime,orgUnitPath,suspended)` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '')
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    const d = await res.json()
    if (!res.ok) return NextResponse.json({ error: `Google users.list ${res.status}: ${d.error?.message ?? ''}` }, { status: 500 })
    gUsers.push(...(d.users ?? []))
    if (!d.nextPageToken) break
    pageToken = d.nextPageToken
  }

  const sb = db()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stus: any[] = []
  for (let f = 0; ; f += 1000) {
    const { data } = await sb.from('academic_students')
      .select('id, first_name, last_name, second_last_name, document_number, email, email_alt, situation, disabled').range(f, f + 999)
    stus.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  const byAlt = new Map<string, typeof stus[0]>()
  for (const s of stus) if (s.email_alt) byAlt.set(String(s.email_alt).toLowerCase(), s)
  // Índice por convención: primernombre.apellidopaterno (sin espacios/acentos)
  const byConvention = new Map<string, typeof stus[0][]>()
  for (const s of stus) {
    const first = norm(String(s.first_name ?? '').trim().split(/\s+/)[0])
    const last = norm(s.last_name)
    if (!first || !last) continue
    const k = `${first}.${last}`
    if (!byConvention.has(k)) byConvention.set(k, [])
    byConvention.get(k)!.push(s)
  }

  const sinRegistro = []
  for (const u of gUsers) {
    const email = String(u.primaryEmail ?? '').toLowerCase()
    if (byAlt.has(email)) continue
    // candidato: local part exacto por convención; luego sin la última letra
    // (sufijo de colisión); luego sin dígitos finales
    const local = email.split('@')[0]
    const tries = [local, local.replace(/[a-z]$/, ''), local.replace(/[0-9]+$/, '')]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cand: any = null
    for (const t of tries) { const c = byConvention.get(t); if (c?.length === 1) { cand = c[0]; break } }
    sinRegistro.push({
      email, nombre_google: u.name?.fullName ?? null, org_unit: u.orgUnitPath ?? null,
      suspendido: !!u.suspended, creado: u.creationTime ?? null, ultimo_login: u.lastLoginTime ?? null,
      candidato: cand ? { student_id: cand.id, nombre: [cand.first_name, cand.last_name, cand.second_last_name].filter(Boolean).join(' '), documento: cand.document_number, email_alt_actual: cand.email_alt ?? null } : null,
    })
  }
  const gSet = new Set(gUsers.map(u => String(u.primaryEmail ?? '').toLowerCase()))
  const registroRoto = stus
    .filter(s => s.email_alt && String(s.email_alt).toLowerCase().endsWith('@' + domain) && !gSet.has(String(s.email_alt).toLowerCase()))
    .map(s => ({ nombre: [s.first_name, s.last_name].filter(Boolean).join(' '), documento: s.document_number, email_alt: s.email_alt }))

  return NextResponse.json({
    dominio: domain,
    buzones_workspace: gUsers.length,
    registrados_en_erp: gUsers.length - sinRegistro.length,
    sin_registro: sinRegistro.length,
    registro_roto: registroRoto.length,
    sin_registro_detalle: sinRegistro,
    registro_roto_detalle: registroRoto,
  })
}
