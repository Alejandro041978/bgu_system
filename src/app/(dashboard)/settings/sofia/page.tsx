import { createClient } from '@supabase/supabase-js'
import { Topbar } from '@/components/layout/topbar'
import { SofiaConfigTabs } from '@/components/sofia/config-tabs'

export default async function SofiaSettingsPage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: bots } = await (supabase as any)
    .from('bots')
    .select('key, name, role, prompt, updated_at')
    .eq('active', true)
    .order('key')

  return (
    <>
      <Topbar title="Bots IA · Configuración" subtitle="Prompt maestro y base de conocimientos de cada asistente" />
      <div className="flex-1 p-6 overflow-auto">
        <SofiaConfigTabs bots={bots ?? []} />
      </div>
    </>
  )
}
