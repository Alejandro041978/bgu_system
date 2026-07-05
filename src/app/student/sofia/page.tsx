import { createClient as createAuthClient } from '@/lib/supabase/server'
import { getEffectiveStudent } from '@/lib/student-identity'
import { ChatUI } from '@/components/sofia/chat-ui'

export const revalidate = 0

export default async function StudentSofiaPage() {
  const supabase = await createAuthClient()
  const { data: { user } } = await supabase.auth.getUser()

  const student = await getEffectiveStudent(user ? { id: user.id, email: user.email } : null)

  let initialMessage = 'Hola, soy Sofia, asistente virtual de BGU. ¿En qué puedo ayudarte hoy?'
  let studentContext = ''
  const contactEmail = student?.email ?? user?.email ?? ''

  if (student) {
    const firstName = student.name.split(' ')[0]
    initialMessage = `¡Hola, ${firstName}! Soy Sofia, asistente virtual de BGU. ¿En qué puedo ayudarte hoy?`
    studentContext = `
=== ESTUDIANTE IDENTIFICADO (portal web) ===
Nombre: ${student.name}
Email: ${student.email ?? '—'}
${student.document_number ? `Documento: ${student.document_number}` : ''}
Instrucción: El estudiante ya está autenticado en el portal. Salúdalo por su nombre y atiende su consulta directamente.
=============================================`
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
