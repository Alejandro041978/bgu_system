import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { EmployeeProfile } from '@/components/hr/employee-profile'
import { ContractList } from '@/components/hr/contract-list'
import { AddContractForm } from '@/components/hr/add-contract-form'
import { EmployeeContractsSigned } from '@/components/contracts/employee-contracts-signed'

export const revalidate = 0

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [empRes, contractsRes, instancesRes] = await Promise.all([
    (supabase as any).from('hr_employees_with_status').select('*').eq('id', id).single(),
    (supabase as any).from('hr_contracts').select('*').eq('employee_id', id).order('start_date', { ascending: false }),
    (supabase as any).from('contract_instances').select('*, template:contract_templates(name)').eq('signer_ref_id', id).order('created_at', { ascending: false }),
  ])

  if (empRes.error || !empRes.data) notFound()

  return (
    <>
      <Topbar
        title={empRes.data.full_name}
        subtitle={empRes.data.active_position ?? empRes.data.position ?? 'Sin cargo activo'}
      />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto space-y-6">
          <EmployeeProfile employee={empRes.data} />
          <EmployeeContractsSigned instances={instancesRes.data ?? []} />
          <ContractList contracts={contractsRes.data ?? []} />
          <AddContractForm employeeId={id} />
        </div>
      </div>
    </>
  )
}
