import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { uploadDocumentFromUrl, sendForSignature } from '@/lib/signnow'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authClient = await createAuthClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const supabase = admin()

    // Obtener contrato + empleado
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: contract, error } = await (supabase as any)
      .from('hr_contracts')
      .select('*, employee:hr_employees(full_name, email)')
      .eq('id', id)
      .single()

    if (error || !contract) return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 })
    if (!contract.file_url) return NextResponse.json({ error: 'El contrato no tiene archivo adjunto' }, { status: 400 })

    // Subir documento a SignNow
    const fileName = `Contrato_${contract.employee.full_name.replace(/\s+/g, '_')}.pdf`
    const documentId = await uploadDocumentFromUrl(contract.file_url, fileName)

    // Enviar invitación a firma
    await sendForSignature({
      documentId,
      signerEmail: contract.employee.email,
      signerName: contract.employee.full_name,
      subject: `Contrato para tu firma — ${contract.position}`,
      message: `Hola ${contract.employee.full_name.split(' ')[0]}, te enviamos tu contrato para que lo revises y firmes digitalmente. Por favor, completa la firma a la brevedad.`,
    })

    // Guardar el document_id de SignNow en el contrato
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('hr_contracts')
      .update({ signnow_document_id: documentId, signnow_status: 'pending' })
      .eq('id', id)

    return NextResponse.json({ ok: true, documentId })
  } catch (err) {
    console.error('SignNow error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = admin()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: contract } = await (supabase as any)
    .from('hr_contracts')
    .select('signnow_document_id, signnow_status')
    .eq('id', id)
    .single()

  if (!contract?.signnow_document_id) {
    return NextResponse.json({ status: 'not_sent' })
  }

  try {
    const { getDocumentStatus } = await import('@/lib/signnow')
    const status = await getDocumentStatus(contract.signnow_document_id)

    const newStatus = status.signers.every(s => s.status === 'fulfilled') ? 'signed' : 'pending'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('hr_contracts')
      .update({ signnow_status: newStatus })
      .eq('id', id)

    return NextResponse.json({ status: newStatus, signers: status.signers })
  } catch (err) {
    return NextResponse.json({ status: contract.signnow_status ?? 'pending', error: String(err) })
  }
}
