import { createClient } from '@supabase/supabase-js'
import { SendContractForm } from '@/components/contracts/send-contract-form'

async function getData() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const [{ data: templates }, { data: employees }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('contract_templates').select('id, name, variables, status').eq('status', 'active').order('name'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('hr_employees').select('id, full_name, email, phone, position, document_number, document_type, birth_date, address').order('full_name'),
  ])
  return { templates: templates ?? [], employees: employees ?? [] }
}

export const revalidate = 0

export default async function NewContractPage() {
  const { templates, employees } = await getData()
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Enviar contrato a firma</h1>
        <p className="text-sm text-gray-500 mt-0.5">Selecciona un colaborador y una plantilla para generar el contrato</p>
      </div>
      <SendContractForm templates={templates} employees={employees} alwaysOpen />
    </div>
  )
}
