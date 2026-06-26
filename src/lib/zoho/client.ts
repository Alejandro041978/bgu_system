import type { ZohoTicket, ZohoTicketListResponse, ZohoComment, ZohoDepartment, ZohoAgent, TicketFilters } from '@/types/zoho'

const ZOHO_BASE_URL = 'https://desk.zoho.com/api/v1'

async function getAccessToken(): Promise<string> {
  const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
      client_id: process.env.ZOHO_CLIENT_ID!,
      client_secret: process.env.ZOHO_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    throw new Error('Failed to refresh Zoho access token')
  }

  const data = await res.json()
  return data.access_token
}

async function zohoFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getAccessToken()
  const orgId = process.env.ZOHO_ORGANIZATION_ID!

  const res = await fetch(`${ZOHO_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      orgId,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Zoho API error ${res.status}: ${error}`)
  }

  return res.json()
}

export async function getTickets(filters: TicketFilters = {}): Promise<ZohoTicketListResponse> {
  const params = new URLSearchParams()
  if (filters.status && filters.status !== 'all') params.set('status', filters.status)
  if (filters.priority && filters.priority !== 'all') params.set('priority', filters.priority)
  if (filters.department) params.set('departmentId', filters.department)
  if (filters.assignee) params.set('assignee', filters.assignee)
  if (filters.channel && filters.channel !== 'all') params.set('channel', filters.channel)
  if (filters.search) params.set('searchStr', filters.search)
  if (filters.from !== undefined) params.set('from', String(filters.from))
  if (filters.limit !== undefined) params.set('limit', String(filters.limit))
  if (filters.sortBy) params.set('sortBy', filters.sortBy)
  if (filters.sortOrder) params.set('sortOrder', filters.sortOrder)

  params.set('include', 'contacts,assignee,departments,team,isRead')

  return zohoFetch<ZohoTicketListResponse>(`/tickets?${params.toString()}`)
}

export async function getTicket(ticketId: string): Promise<ZohoTicket> {
  return zohoFetch<ZohoTicket>(`/tickets/${ticketId}?include=contacts,assignee,departments,team,conversations,comments`)
}

export async function getTicketComments(ticketId: string): Promise<{ data: ZohoComment[] }> {
  return zohoFetch<{ data: ZohoComment[] }>(`/tickets/${ticketId}/comments`)
}

export async function getTicketConversations(ticketId: string): Promise<{ data: ZohoComment[] }> {
  return zohoFetch<{ data: ZohoComment[] }>(`/tickets/${ticketId}/conversations`)
}

export async function replyToTicket(ticketId: string, content: string, isPublic = true): Promise<ZohoComment> {
  return zohoFetch<ZohoComment>(`/tickets/${ticketId}/sendReply`, {
    method: 'POST',
    body: JSON.stringify({ content, isPublic, contentType: 'html' }),
  })
}

export async function updateTicketStatus(ticketId: string, status: string): Promise<ZohoTicket> {
  return zohoFetch<ZohoTicket>(`/tickets/${ticketId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export async function getDepartments(): Promise<{ data: ZohoDepartment[] }> {
  return zohoFetch<{ data: ZohoDepartment[] }>('/departments')
}

export async function getAgents(): Promise<{ data: ZohoAgent[] }> {
  return zohoFetch<{ data: ZohoAgent[] }>('/agents')
}

export async function getTicketMetrics(from: string, to: string) {
  const params = new URLSearchParams({ from, to })
  return zohoFetch(`/reports/overview?${params.toString()}`)
}
