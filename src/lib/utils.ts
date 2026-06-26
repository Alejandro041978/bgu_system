import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateString: string | null, opts?: Intl.DateTimeFormatOptions): string {
  if (!dateString) return '—'
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...opts,
  }).format(new Date(dateString))
}

export function formatDateTime(dateString: string | null): string {
  if (!dateString) return '—'
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString))
}

export function timeAgo(dateString: string): string {
  const now = new Date()
  const date = new Date(dateString)
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'ahora'
  if (diffMins < 60) return `hace ${diffMins}m`
  if (diffHours < 24) return `hace ${diffHours}h`
  if (diffDays < 7) return `hace ${diffDays}d`
  return formatDate(dateString)
}

export function getPriorityColor(priority: string): string {
  const map: Record<string, string> = {
    Urgent: 'text-red-600 bg-red-50 border-red-200',
    High: 'text-orange-600 bg-orange-50 border-orange-200',
    Medium: 'text-yellow-600 bg-yellow-50 border-yellow-200',
    Low: 'text-green-600 bg-green-50 border-green-200',
  }
  return map[priority] ?? 'text-gray-600 bg-gray-50 border-gray-200'
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    Open: 'text-blue-600 bg-blue-50 border-blue-200',
    'In Progress': 'text-purple-600 bg-purple-50 border-purple-200',
    'On Hold': 'text-yellow-600 bg-yellow-50 border-yellow-200',
    Closed: 'text-green-600 bg-green-50 border-green-200',
    Escalated: 'text-red-600 bg-red-50 border-red-200',
  }
  return map[status] ?? 'text-gray-600 bg-gray-50 border-gray-200'
}
