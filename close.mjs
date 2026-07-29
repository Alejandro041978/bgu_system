import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')]}))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const { data: f } = await sb.storage.from('contracts').list('', { limit: 1 })
const name = f[0].name
const publicUrl = sb.storage.from('contracts').getPublicUrl(name).data.publicUrl
const before = await fetch(publicUrl)
console.log('ANTES  → descarga anónima:', before.status, before.status===200?'EXPUESTO':'bloqueado')

const { error } = await sb.storage.updateBucket('contracts', { public: false })
console.log('Cerrando bucket:', error ? 'ERROR '+error.message : 'OK (ahora privado)')

await new Promise(r=>setTimeout(r,3000))
const after = await fetch(publicUrl)
console.log('DESPUÉS→ descarga anónima:', after.status, after.status===200?'¡SIGUE EXPUESTO!':'BLOQUEADO ✅')

// La URL firmada (lo que ahora usa el ERP) debe funcionar
const { data: s } = await sb.storage.from('contracts').createSignedUrl(name, 300)
const sr = await fetch(s.signedUrl)
console.log('URL FIRMADA (ERP):', sr.status, sr.status===200?'✅ funciona ('+sr.headers.get('content-length')+' bytes)':'❌ falla')
