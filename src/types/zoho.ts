export interface ZohoTicket {
  id: string
  ticketNumber: string
  subject: string
  description: string | null
  status: string
  priority: string
  channel: string
  departmentId: string
  departmentName?: string
  contactId: string | null
  contactName?: string
  assigneeId: string | null
  assigneeName?: string
  teamId: string | null
  teamName?: string
  dueDate: string | null
  createdTime: string
  modifiedTime: string
  closedTime: string | null
  firstResponseTime: string | null
  resolutionTime: string | null
  responseCount: number
  customerResponseCount: number
  isOverdue: boolean
  isTrashed: boolean
  tagIds: string[]
  cf: Record<string, unknown>
  sentiment?: ZohoSentiment
  statusType: 'open' | 'closed' | 'on_hold'
}

export interface ZohoSentiment {
  type: 'positive' | 'negative' | 'neutral'
  percentPositive: number
  percentNegative: number
  percentNeutral: number
}

export interface ZohoComment {
  id: string
  ticketId: string
  author: string
  authorType: 'enduser' | 'agent'
  content: string
  contentType: 'html' | 'plainText'
  createdTime: string
  isEdited: boolean
}

export interface ZohoDepartment {
  id: string
  name: string
  description: string | null
  isEnabled: boolean
}

export interface ZohoAgent {
  id: string
  name: string
  email: string
  photoURL: string | null
  role: string
  isActive: boolean
}

export interface ZohoTicketListResponse {
  data: ZohoTicket[]
  info: {
    totalCount: number
    count: number
    from: number
    limit: number
  }
}

export type TicketStatus = 'Open' | 'In Progress' | 'On Hold' | 'Closed' | 'Escalated'
export type TicketPriority = 'Low' | 'Medium' | 'High' | 'Urgent'
export type TicketChannel = 'Email' | 'Phone' | 'Chat' | 'Web' | 'Social'

export interface TicketFilters {
  status?: TicketStatus | 'all'
  priority?: TicketPriority | 'all'
  department?: string
  assignee?: string
  channel?: TicketChannel | 'all'
  search?: string
  from?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}
