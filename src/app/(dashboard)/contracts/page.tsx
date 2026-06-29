import { createClient } from '@supabase/supabase-js'
import { ContractTemplatesManager } from '@/components/contracts/contract-templates-manager'
import { SendContractForm } from '@/components/contracts/send-contract-form'

async function getData() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const [{ data: templates }, { data: employees }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('contract_templates').select('*').order('created_at', { ascending: false }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('hr_employees').select('id, full_name, email, phone, position, document_number, document_type, birth_date, address').order('full_name'),
  ])
  return { templates: templates ?? [], employees: employees ?? [] }
}

export default async function ContractsPage() {
  const { templates, employees } = await getData()
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <SendContractForm templates={templates} employees={employees} />
      <ContractTemplatesManager initialTemplates={templates} />
    </div>
  )
}
