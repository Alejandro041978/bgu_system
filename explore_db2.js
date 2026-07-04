const { createClient } = require('@supabase/supabase-js')
const sb = createClient(
  'https://qpwhefuenpenoeujmplp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwd2hlZnVlbnBlbm9ldWptcGxwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjUwODg0NiwiZXhwIjoyMDk4MDg0ODQ2fQ.rUHNcg925270YiMkeQIOW_UhryEI_07WOSLFG1oQZCQ'
)

async function run() {
  const { data, error } = await sb.from('desk_happiness_ratings').select('*').limit(3)
  console.log('desk_happiness_ratings:', error?.message ?? JSON.stringify(data, null, 2))
}
run().catch(console.error)
