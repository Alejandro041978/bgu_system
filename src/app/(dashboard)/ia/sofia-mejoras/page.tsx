import { createClient } from '@supabase/supabase-js'
import { Topbar } from '@/components/layout/topbar'
import { SuggestionsView } from '@/components/sofia/suggestions-view'

export const revalidate = 0

export default async function SofiaMejorasPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!) as any
  const { data: bots } = await db.from('bots').select('key, name').eq('active', true).order('key')

  return (
    <>
      <Topbar title="Bots · Mejora continua" subtitle="IA" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <SuggestionsView bots={bots ?? []} />
        </div>
      </div>
    </>
  )
}
