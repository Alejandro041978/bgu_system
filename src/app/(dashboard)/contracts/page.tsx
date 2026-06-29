import { createClient } from '@supabase/supabase-js'
import { ContractInstancesList } from '@/components/contracts/contract-instances-list'

async function getInstances() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('contract_instances')
    .select('*, template:contract_templates(name)')
    .order('created_at', { ascending: false })
  return data ?? []
}

export const revalidate = 0

export default async function ContractsListPage() {
  const instances = await getInstances()
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Contratos enviados</h1>
        <p className="text-sm text-gray-500 mt-0.5">Historial de contratos digitales y su estado de firma</p>
      </div>
      <ContractInstancesList instances={instances} />
    </div>
  )
}
