import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS })
}

export async function POST(req: NextRequest) {
  try {
    const { email, studentCode } = await req.json() as {
      email?: string
      studentCode?: string  // gancho para gestor académico interno
    }

    if (!email && !studentCode) {
      return NextResponse.json({ error: 'Se requiere email o código de estudiante' }, { status: 400, headers: CORS_HEADERS })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // === FUTURO: aquí irá la llamada al gestor académico interno ===
    // const academicData = await fetchFromAcademicSystem(studentCode)
    // Por ahora, solo usamos los datos de Supabase (tickets de Zoho Desk)

    // Buscar por email en tickets
    let ticketQuery = supabase
      .from('desk_tickets')
      .select('subject, status, status_type, department_name, assignee_name, zoho_created_at, closed_time, priority, channel')
      .order('zoho_created_at', { ascending: false })
      .limit(10)

    if (email) {
      ticketQuery = ticketQuery.eq('contact_email', email)
    }

    const { data: tickets } = await ticketQuery

    if (!tickets || tickets.length === 0) {
      return NextResponse.json({
        found: false,
        context: null,
        message: 'No se encontraron registros para este estudiante.',
      }, { headers: CORS_HEADERS })
    }

    // Construir contexto del estudiante para inyectar al prompt
    const openTickets = tickets.filter(t => t.status_type === 'open' || t.status_type === 'on_hold')
    const closedTickets = tickets.filter(t => t.status_type === 'closed')
    const departments = [...new Set(tickets.map(t => t.department_name).filter(Boolean))]
    const assignees = [...new Set(tickets.map(t => t.assignee_name).filter(Boolean))]
    const channels = [...new Set(tickets.map(t => t.channel).filter(Boolean))]

    const recentTicketsSummary = tickets.slice(0, 5).map(t =>
      `  - [${t.status_type === 'closed' ? 'Cerrado' : 'Abierto'}] ${t.subject ?? 'Sin asunto'} (${t.department_name ?? 'General'}, ${new Date(t.zoho_created_at).toLocaleDateString('es-PE')})`
    ).join('\n')

    const studentContext = `
=== CONTEXTO DEL ESTUDIANTE IDENTIFICADO ===
Email: ${email ?? 'No proporcionado'}
${studentCode ? `Código: ${studentCode}` : ''}

Historial en el sistema de soporte:
- Total de tickets registrados: ${tickets.length}
- Tickets abiertos o en espera: ${openTickets.length}
- Tickets cerrados: ${closedTickets.length}
- Departamentos con los que ha interactuado: ${departments.join(', ') || 'No disponible'}
- Asesores que lo han atendido: ${assignees.join(', ') || 'No disponible'}
- Canal preferido: ${channels[0] ?? 'No disponible'}

Últimas consultas:
${recentTicketsSummary}

${openTickets.length > 0 ? `⚠️ IMPORTANTE: El estudiante tiene ${openTickets.length} ticket(s) abierto(s). Sus temas pendientes son: ${openTickets.map(t => t.subject).filter(Boolean).join('; ')}` : ''}

Instrucción: Usa este contexto para personalizar tu atención. Saluda al estudiante por su nombre si lo conoces. Si tiene tickets abiertos, puedes mencionarlo proactivamente. Adapta tu respuesta a su historial.
==============================================`

    return NextResponse.json({
      found: true,
      email,
      ticketCount: tickets.length,
      openCount: openTickets.length,
      departments,
      context: studentContext,
    }, { headers: CORS_HEADERS })

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers: CORS_HEADERS })
  }
}
