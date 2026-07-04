import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { ChatUI } from '@/components/sofia/chat-ui'

export const revalidate = 0

export default async function StudentSofiaPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()

  let studentName = ''
  let contactEmail = user?.email ?? ''
  let initialMessage = 'Hola, soy Sofia, asistente virtual de BGU. ¿En qué puedo ayudarte hoy?'
  let studentContext = ''

  if (user?.email) {
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: student } = await (admin as any)
      .from('academic_students')
      .select('first_name, last_name, second_last_name, email, phone_number, document_number, country, city')
      .eq('email', user.email)
      .eq('disabled', false)
      .maybeSingle()

    if (student) {
      const fullName = [student.first_name, student.last_name, student.second_last_name].filter(Boolean).join(' ')
      studentName = fullName
      const firstName = student.first_name ?? fullName.split(' ')[0]
      initialMessage = `¡Hola, ${firstName}! Soy Sofia, asistente virtual de BGU. ¿En qué puedo ayudarte hoy?`
      studentContext = `
=== ESTUDIANTE IDENTIFICADO (portal web) ===
Nombre: ${fullName}
Email: ${student.email}
${student.phone_number ? `Teléfono: ${student.phone_number}` : ''}
${student.document_number ? `Documento: ${student.document_number}` : ''}
${student.city || student.country ? `Ubicación: ${[student.city, student.country].filter(Boolean).join(', ')}` : ''}
Instrucción: El estudiante ya está autenticado en el portal. Salúdalo por su nombre y atiende su consulta directamente.
=============================================`
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Sofia · Chat</h1>
        <p className="text-sm text-gray-500 mt-0.5">Asistente virtual de Blackwell Global University</p>
      </div>
      <ChatUI
        initialMessage={initialMessage}
        contactEmail={contactEmail}
        studentContext={studentContext || undefined}
      />
    </div>
  )
}
