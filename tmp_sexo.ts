import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'fs'
const env = fs.readFileSync('.env.local', 'utf8')
const get = (k: string) => env.split('\n').find(l => l.startsWith(k + '='))?.slice(k.length + 1).trim()
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL')!, get('SUPABASE_SERVICE_ROLE_KEY')!)
const ai = new Anthropic({ apiKey: get('ANTHROPIC_API_KEY')! })

async function main() {
  const alumnos: any[] = []
  for (let i = 0; ; i += 1000) {
    const { data, error } = await sb.from('academic_students').select('id, first_name').range(i, i + 999)
    if (error) throw new Error(error.message)
    alumnos.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  const nombres = [...new Set(alumnos.map(a => String(a.first_name ?? '').trim().toUpperCase()).filter(n => n.length > 1))].sort()
  console.log('estudiantes:', alumnos.length, '| nombres distintos:', nombres.length)

  const sexoDe: Record<string, string> = {}
  for (let i = 0; i < nombres.length; i += 120) {
    const lote = nombres.slice(i, i + 120)
    const r = await ai.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4000,
      messages: [{ role: 'user', content:
        'Clasifica el sexo probable de estas personas por su(s) nombre(s) de pila. Son mayormente nombres hispanos/latinoamericanos (Bolivia, Peru), pero puede haber de otros origenes. Responde SOLO un objeto JSON que mapee cada nombre EXACTO a "M" (masculino), "F" (femenino) o "?" (ambiguo o desconocido). Usa "?" solo si de verdad no es determinable. Nombres:\n' + JSON.stringify(lote) }],
    })
    const txt = r.content.filter(c => c.type === 'text').map((c: any) => c.text).join('')
    const m = txt.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('lote ' + i + ': sin JSON en la respuesta')
    const obj = JSON.parse(m[0])
    for (const [k, v] of Object.entries(obj)) if (lote.includes(k)) sexoDe[k] = String(v)
    const falta = lote.filter(n => !(n in sexoDe))
    for (const n of falta) sexoDe[n] = '?'
    console.log('lote', i / 120 + 1, 'de', Math.ceil(nombres.length / 120), '| clasificados', Object.keys(sexoDe).length, falta.length ? '| sin respuesta ' + falta.length : '')
  }
  const conteo = { M: 0, F: 0, dudosos: 0 }
  for (const v of Object.values(sexoDe)) v === 'M' ? conteo.M++ : v === 'F' ? conteo.F++ : conteo.dudosos++
  console.log('nombres:', JSON.stringify(conteo))
  let estM = 0, estF = 0, estD = 0
  for (const a of alumnos) {
    const s = sexoDe[String(a.first_name ?? '').trim().toUpperCase()]
    s === 'M' ? estM++ : s === 'F' ? estF++ : estD++
  }
  console.log('estudiantes: M', estM, '| F', estF, '| sin clasificar', estD)
  fs.writeFileSync('NO_CORRER_respaldo_sexo_inferido.json', JSON.stringify({
    generado: new Date().toISOString(),
    regla: 'sexo deducido del nombre de pila con Claude (claude-opus-4-8); "?" queda NULL; errores puntuales aceptados por el usuario (11/09/2026), corregibles con sex_source=manual',
    estudiantes: alumnos.length, nombres_distintos: nombres.length, conteo_nombres: conteo,
    estudiantes_estimado: { M: estM, F: estF, sin_clasificar: estD },
    sexo_por_nombre: sexoDe,
  }, null, 2))
  console.log('respaldo escrito: NO_CORRER_respaldo_sexo_inferido.json')
}
main().catch(e => { console.error(e.message ?? e); process.exit(1) })
