'use client'

import { useRouter } from 'next/navigation'

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function formatMonth(m: string) {
  const [y, mo] = m.split('-').map(Number)
  return `${MONTH_NAMES[mo - 1]} ${y}`
}

export function MetricsFilters({ months, selectedMonth }: { months: string[]; selectedMonth: string }) {
  const router = useRouter()
  return (
    <select
      value={selectedMonth}
      onChange={e => router.push(`/desk/metrics?month=${e.target.value}`)}
      className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {months.map(m => (
        <option key={m} value={m}>{formatMonth(m)}</option>
      ))}
    </select>
  )
}
