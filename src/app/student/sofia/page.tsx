import { ChatUI } from '@/components/sofia/chat-ui'

export default function StudentSofiaPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Sofia · Chat</h1>
        <p className="text-sm text-gray-500 mt-0.5">Asistente virtual de Blackwell Global University</p>
      </div>
      <ChatUI source="student-portal" />
    </div>
  )
}
