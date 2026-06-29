import { createClient } from '@supabase/supabase-js'
import { Topbar } from '@/components/layout/topbar'
import { HRStatsBar } from '@/components/hr/stats-bar'
import { EmployeeList } from '@/components/hr/employee-list'
import Link from 'next/link'
import { UserPlus } from 'lucide-react'

export const revalidate = 0

type EmployeeRow = {
  id: string
  full_name: string
  email: string
  phone: string | null
  position: string | null
  employee_type: 'direct' | 'contractor' | 'external'
  active_contract_id: string | null
  active_position: string | null
  latest_contract_end: string | null
  contract_count: number
  created_at: string
}

export default async function HRPage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: employees } = await supabase
    .from('hr_employees_with_status')
    .select('*')
    .order('full_name') as { data: EmployeeRow[] | null }

  const rows = employees ?? []
  const active = rows.filter(e => e.active_contract_id)
  const direct = rows.filter(e => e.employee_type === 'direct')
  const contractors = rows.filter(e => e.employee_type === 'contractor')
  const external = rows.filter(e => e.employee_type === 'external')

  return (
    <>
      <Topbar title="Colaboradores" subtitle="Gestión de personal BGU" />
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <div className="flex items-center justify-between">
          <HRStatsBar
            total={rows.length}
            active={active.length}
            direct={direct.length}
            contractors={contractors.length}
            external={external.length}
          />
          <Link
            href="/hr/new"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors ml-4 flex-shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            Nuevo colaborador
          </Link>
        </div>
        <EmployeeList employees={rows} />
      </div>
    </>
  )
}
