import { NextResponse } from 'next/server'
import { guardStaff } from '@/lib/api-guard'
import { bitrixConfigurado, bitrix, embudosBGU, usuarioBot, usuariosBot, usuariosBitrix, ETIQUETA_UMBRAL } from '@/lib/bitrix'

export const revalidate = 0

// Diagnóstico de la conexión con Bitrix24. Sin esto, la única forma de saber si
// el webhook, los embudos BGU, la etapa umbral y el usuario del bot están bien
// sería registrar un referido de verdad y mirar qué pasó.
//
// No revela la URL del webhook: es una credencial.
export async function GET(req: Request) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  if (!bitrixConfigurado()) {
    return NextResponse.json({ configurado: false, nota: 'Falta BITRIX_WEBHOOK_URL en el entorno' })
  }

  const out: Record<string, unknown> = { configurado: true, etapa_umbral_buscada: ETIQUETA_UMBRAL }
  try {
    const perfil = await bitrix('profile')
    out.conecta_como = { id: perfil?.ID, nombre: [perfil?.NAME, perfil?.LAST_NAME].filter(Boolean).join(' '), admin: perfil?.ADMIN }
  } catch (e) {
    return NextResponse.json({ ...out, error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }

  try {
    const embudos = await embudosBGU()
    out.embudos_bgu = embudos.map(e => ({
      id: e.id, nombre: e.nombre, etapas: e.etapas.length,
      // Si esto sale null, la regla de los 3 meses no tiene umbral en ese
      // embudo y TODO por debajo de "ganada" contaría como frío.
      umbral: e.etapas.find(x => x.nombre.trim().toLowerCase() === ETIQUETA_UMBRAL.trim().toLowerCase())?.status_id ?? null,
      nombres_de_etapas: e.etapas.map(x => x.nombre),
    }))
    const destino = process.env.BITRIX_PIPELINE_REFERRALS ? embudos.find(e => e.nombre === process.env.BITRIX_PIPELINE_REFERRALS) : null
    out.embudo_donde_se_crean = (destino ?? embudos[0])?.nombre ?? null
    out.embudos_sin_etapa_umbral = embudos.filter(e => !e.etapas.some(x => x.nombre.trim().toLowerCase() === ETIQUETA_UMBRAL.trim().toLowerCase())).map(e => e.nombre)
  } catch (e) {
    out.embudos_error = e instanceof Error ? e.message : String(e)
  }

  out.usuario_bot = await usuarioBot()
  // Los candidatos, para poder fijar BITRIX_BOT_USER_ID sin adivinar.
  try {
    out.usuarios_con_bot_en_el_nombre = await usuariosBot()
    // ?usuarios=1 → el listado completo, para elegir el id a mano cuando no
    // hay ninguna cuenta que se llame "bot".
    if (new URL(req.url).searchParams.get('usuarios') === '1') out.usuarios = await usuariosBitrix()
  } catch { /* sin permiso de usuarios */ }
  if (!out.usuario_bot) {
    // Sin ASSIGNED_BY_ID, Bitrix asigna la negociación al dueño del webhook:
    // no quedan sin responsable, quedan a nombre de quien lo creó.
    out.usuario_bot_nota = 'No se encontró la cuenta del bot: las negociaciones quedarían a nombre del usuario del webhook. Abre /api/bitrix/diag?usuarios=1 para ver los ids y fija BITRIX_BOT_USER_ID.'
  }

  return NextResponse.json(out)
}
