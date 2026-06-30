export const ACTION_STATUS: Record<string, { label: string; color: string }> = {
  not_started: { label: 'No iniciada',   color: 'bg-gray-100 text-gray-500' },
  active:      { label: 'En ejecución',  color: 'bg-blue-100 text-blue-700' },
  completed:   { label: 'Completada',    color: 'bg-green-100 text-green-700' },
  at_risk:     { label: 'En riesgo',     color: 'bg-amber-100 text-amber-700' },
  overdue:     { label: 'Vencida',       color: 'bg-red-100 text-red-700' },
  cancelled:   { label: 'Cancelada',     color: 'bg-gray-100 text-gray-500' },
}
