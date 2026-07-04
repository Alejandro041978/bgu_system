import { createClient } from '@supabase/supabase-js'
import { Topbar } from '@/components/layout/topbar'
import { SofiaConfigTabs } from '@/components/sofia/config-tabs'

export default async function SofiaSettingsPage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data } = await supabase
    .from('ai_master_prompt')
    .select('prompt, ticket_count, conversation_count, updated_at')
    .eq('id', 1)
    .single() as { data: { prompt: string; ticket_count: number; conversation_count: number; updated_at: string } | null }

  return (
    <>
      <Topbar title="Sofia IA · Configuración" subtitle="Prompt maestro y base de conocimientos del asistente virtual" />
      <div className="flex-1 p-6 overflow-auto">
        <SofiaConfigTabs
          initialPrompt={data?.prompt ?? ''}
          ticketCount={data?.ticket_count ?? 0}
          convCount={data?.conversation_count ?? 0}
          updatedAt={data?.updated_at ?? null}
        />
      </div>
    </>
  )
}
