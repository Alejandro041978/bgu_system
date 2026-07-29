import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')]}))
const svc  = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
for (const b of ['contracts','admission-docs','degree-files','inbox-attachments']) {
  const { data, error } = await svc.storage.from(b).list('', { limit: 1000 })
  const n = data?.length ?? 0
  // ¿un anónimo puede LISTAR?
  const { data: aList } = await anon.storage.from(b).list('', { limit: 5 })
  console.log(`${b.padEnd(20)} archivos=${error? 'ERR' : n} | listado anónimo: ${aList?.length ? '¡SÍ ('+aList.length+')!' : 'no'}`)
  if (n && b==='contracts') console.log('   ejemplos:', data.slice(0,4).map(f=>f.name).join(', '))
}
// prueba de descarga anónima real sobre contracts
const { data: files } = await svc.storage.from('contracts').list('', { limit: 1 })
if (files?.length) {
  const url = svc.storage.from('contracts').getPublicUrl(files[0].name).data.publicUrl
  const r = await fetch(url)
  console.log(`\nDescarga ANÓNIMA de "${files[0].name}": HTTP ${r.status} ${r.status===200?'→ ¡ARCHIVO EXPUESTO!':'(bloqueado)'} ${r.status===200?`(${r.headers.get('content-type')}, ${r.headers.get('content-length')} bytes)`:''}`)
}
