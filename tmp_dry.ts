import * as fs from 'fs'
const env = fs.readFileSync('.env.local', 'utf8')
const get = (k: string) => env.split('\n').find(l => l.startsWith(k + '='))?.slice(k.length + 1).trim()
async function main() {
  const r = await fetch('https://system.blackwell.university/api/cron/campaigns?dry_run=1', {
    method: 'POST', headers: { Authorization: `Bearer ${get('CRON_SECRET')}` },
  })
  const j = await r.json()
  console.log(JSON.stringify(j, null, 1).slice(0, 1500))
}
main().catch(e => { console.error(e.message ?? e); process.exit(1) })
