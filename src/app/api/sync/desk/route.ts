import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ZOHO_BASE_URL = 'https://desk.zoho.com/api/v1'
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID!
const CRON_SECRET = process.env.CRON_SECRET!

async function getZohoAccessToken(): Promise<string> {
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
  const data = await res.json()
  if (!data.access_token) throw new Error('Failed to get Zoho access token')
  return data.access_token
}

async function zohoGet(path: string, token: string) {
  const res = await fetch(`${ZOHO_BASE_URL}${path}`, {
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      orgId: ORG_ID,
    },
  })
  if (!res.ok) throw new Error(`Zoho API error ${res.status} on ${path}`)
  return res.json()
}

async function runSync(request: NextRequest) {
  // Verificar que viene de Vercel Cron o de una llamada autorizada
  const authHeader = request.headers.get('authorization')
  const cronHeader = request.headers.get('x-vercel-cron')
  const isVercelCron = cronHeader === '1'
  const isAuthorized = authHeader === `Bearer ${CRON_SECRET}`

  if (!isVercelCron && !isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Crear log de sincronización
  const { data: syncLog, error: logError } = await supabase
    .from('sync_logs')
    .insert({ sync_type: 'full', status: 'running' })
    .select()
    .single()

  if (logError) {
    return NextResponse.json({ error: 'DB error creating log', detail: logError.message }, { status: 500 })
  }

  const logId = syncLog?.id

  try {
    const token = await getZohoAccessToken()
    let ticketsSynced = 0
    let conversationsSynced = 0
    let from = 0
    const limit = 100

    // Sincronizar todos los tickets paginando
    while (true) {
      const data = await zohoGet(
        `/tickets?from=${from}&limit=${limit}&sortBy=modifiedTime&sortOrder=desc`,
        token
      )

      const tickets = data.data ?? []
      if (tickets.length === 0) break

      const ticketRows = tickets.map((t: any) => ({
        id: t.id,
        ticket_number: t.ticketNumber,
        subject: t.subject,
        description: t.description ?? null,
        status: t.status,
        status_type: t.statusType,
        priority: t.priority,
        channel: t.channel ?? null,
        department_id: t.departmentId ?? null,
        department_name: t.departmentName ?? null,
        contact_id: t.contactId ?? null,
        contact_name: t.contact?.firstName
          ? `${t.contact.firstName} ${t.contact.lastName ?? ''}`.trim()
          : null,
        contact_email: t.contact?.email ?? null,
        assignee_id: t.assigneeId ?? null,
        assignee_name: t.assignee?.firstName
          ? `${t.assignee.firstName} ${t.assignee.lastName ?? ''}`.trim()
          : null,
        assignee_email: t.assignee?.email ?? null,
        team_id: t.teamId ?? null,
        team_name: t.team?.name ?? null,
        due_date: t.dueDate ?? null,
        is_overdue: t.isOverdue ?? false,
        response_count: t.responseCount ?? 0,
        customer_response_count: t.customerResponseCount ?? 0,
        first_response_time: t.firstResponseTime ?? null,
        resolution_time: t.resolutionTime ?? null,
        closed_time: t.closedTime ?? null,
        cf: t.cf ?? {},
        zoho_created_at: t.createdTime,
        zoho_modified_at: t.modifiedTime,
        synced_at: new Date().toISOString(),
      }))

      // Upsert tickets
      await supabase.from('desk_tickets').upsert(ticketRows, { onConflict: 'id' })
      ticketsSynced += tickets.length

      // Sincronizar conversaciones de cada ticket
      for (const ticket of tickets) {
        try {
          const convData = await zohoGet(`/tickets/${ticket.id}/conversations`, token)
          const conversations = convData.data ?? []

          if (conversations.length > 0) {
            const convRows = conversations.map((c: any) => ({
              id: c.id,
              ticket_id: ticket.id,
              author: c.author ?? null,
              author_type: c.authorType,
              author_email: c.authorEmail ?? null,
              content: c.content ?? null,
              content_type: c.contentType ?? 'html',
              is_edited: c.isEdited ?? false,
              zoho_created_at: c.createdTime,
              synced_at: new Date().toISOString(),
            }))

            await supabase
              .from('desk_conversations')
              .upsert(convRows, { onConflict: 'id' })

            conversationsSynced += conversations.length
          }
        } catch {
          // Continuar con el siguiente ticket si uno falla
        }
      }

      if (tickets.length < limit) break
      from += limit

      // Pausa para no saturar la API de Zoho
      await new Promise(r => setTimeout(r, 200))
    }

    // Actualizar log como exitoso
    await supabase
      .from('sync_logs')
      .update({
        status: 'success',
        tickets_synced: ticketsSynced,
        conversations_synced: conversationsSynced,
        finished_at: new Date().toISOString(),
      })
      .eq('id', logId)

    return NextResponse.json({
      success: true,
      tickets_synced: ticketsSynced,
      conversations_synced: conversationsSynced,
    })

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'

    await supabase
      .from('sync_logs')
      .update({
        status: 'error',
        error_message: message,
        finished_at: new Date().toISOString(),
      })
      .eq('id', logId)

    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return runSync(request)
}

export async function GET(request: NextRequest) {
  return runSync(request)
}
