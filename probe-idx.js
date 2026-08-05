const fs = require('fs')
const env = {}
for (const l of fs.readFileSync('C:/BGU_system/bgu-erp/.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
}
;(async () => {
  const sql = `select indexname, indexdef from pg_indexes where tablename = 'account_payments'`
  const res = await fetch(env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/rpc/exec_sql', {
    method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  })
  console.log('exec_sql →', res.status, (await res.text()).slice(0, 600))
  process.exit(0)
})()
