import { createClient } from '@supabase/supabase-js'
import { ContractTemplatesManager } from '@/components/contracts/contract-templates-manager'
import { SendContractForm } from '@/components/contracts/send-contract-form'

async function getTemplates() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('contract_templates')
    .select('*')
    .order('created_at', { ascending: false })
  return data ?? []
}

export default async function ContractsPage() {
  const templates = await getTemplates()
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <SendContractForm templates={templates} />
      <ContractTemplatesManager initialTemplates={templates} />
    </div>
  )
}
