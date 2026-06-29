import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import { SigningFlow } from './signing-flow'

async function getContract(token: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('contract_instances')
    .select('id, signer_name, signer_email, rendered_body, status, token_expires_at, signed_at, token')
    .eq('token', token)
    .single()
  return data
}

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const contract = await getContract(token)

  if (!contract) notFound()

  const expired = new Date(contract.token_expires_at) < new Date()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-white" stroke="currentColor" strokeWidth={2}>
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Firma de documento</h1>
            <p className="text-sm text-gray-500">Revisa y firma el contrato a continuación</p>
          </div>
        </div>

        <SigningFlow
          contract={contract}
          expired={expired}
        />
      </div>
    </div>
  )
}
