import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { EmployeeProfile } from '@/components/hr/employee-profile'
import { ContractList } from '@/components/hr/contract-list'
import { AddContractForm } from '@/components/hr/add-contract-form'

export const revalidate = 0

type Contract = {
  id: string
  contract_type: string
  position: string
  start_date: string
  end_date: string | null
  salary: number | null
  currency: string
  file_url: string | null
  notes: string | null
  created_at: string
}

type Employee = {
  id: string
  full_name: string
  email: string
  phone: string | null
  position: string | null
  employee_type: 'direct' | 'contractor' | 'external'
  document_type: string | null
  document_number: string | null
  birth_date: string | null
  address: string | null
  notes: string | null
  user_id: string | null
  created_at: string
  active_contract_id: string | null
  active_position: string | null
  contract_count: number
}

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [empRes, contractsRes] = await Promise.all([
    (supabase as any).from('hr_employees_with_status').select('*').eq('id', id).single(),
    (supabase as any).from('hr_contracts').select('*').eq('employee_id', id).order('start_date', { ascending: false }),
  ])

  if (empRes.error || !empRes.data) notFound()

  const employee = empRes.data as Employee
  const contracts = (contractsRes.data ?? []) as Contract[]

  return (
    <>
      <Topbar
        title={employee.full_name}
        subtitle={employee.active_position ?? employee.position ?? 'Sin cargo activo'}
      />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto space-y-6">
          <EmployeeProfile employee={employee} />
          <ContractList contracts={contracts} />
          <AddContractForm employeeId={id} />
        </div>
      </div>
    </>
  )
}
