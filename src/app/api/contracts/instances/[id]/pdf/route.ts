import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateContractPdf } from '@/lib/generate-contract-pdf'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = admin()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: instance, error } = await (supabase as any)
      .from('contract_instances')
      .select('id, signer_name, signer_email, rendered_body, signed_at, ip_address, status, template:contract_templates(name)')
      .eq('id', id)
      .single()

    if (error || !instance) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    if (instance.status !== 'signed') return NextResponse.json({ error: 'Solo contratos firmados' }, { status: 400 })
    if (!instance.rendered_body) return NextResponse.json({ error: 'El contrato no tiene contenido' }, { status: 400 })

    const pdfBuffer = await generateContractPdf({
      signerName: instance.signer_name ?? '',
      signerEmail: instance.signer_email ?? '',
      templateName: instance.template?.name ?? 'Contrato',
      body: instance.rendered_body,
      signedAt: new Date(instance.signed_at),
      ipAddress: instance.ip_address ?? '—',
    })

    const fileName = `${instance.id}.pdf`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).storage.from('contracts').remove([fileName])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: uploadErr } = await (supabase as any).storage
      .from('contracts')
      .upload(fileName, pdfBuffer, { contentType: 'application/pdf', upsert: true })

    if (uploadErr) return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: urlData } = (supabase as any).storage.from('contracts').getPublicUrl(fileName)
    const pdfUrl: string = urlData?.publicUrl

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('contract_instances').update({ pdf_url: pdfUrl }).eq('id', id)

    return NextResponse.json({ ok: true, pdf_url: pdfUrl })
  } catch (err) {
    console.error('PDF generation error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
