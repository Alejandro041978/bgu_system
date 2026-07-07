import { NextRequest, NextResponse } from 'next/server'
import { systemActivaClient } from '@/lib/systemactiva'

export const maxDuration = 60

// Descubrimiento de esquema de SystemActiva (SOLO LECTURA). Protegido con CRON_SECRET.
// POST {}                         → todas las tablas + columnas
// POST { table, sample: true }    → columnas + hasta 5 filas de muestra de esa tabla
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as { table?: string; sample?: boolean }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let client: any
  try {
    client = await systemActivaClient()

    if (body.table) {
      const cols = await client.query(
        `select column_name, data_type, is_nullable
         from information_schema.columns
         where table_name = $1 and table_schema not in ('pg_catalog','information_schema')
         order by ordinal_position`,
        [body.table]
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let sample: any[] = []
      if (body.sample && cols.rows.length > 0) {
        const safe = String(body.table).replace(/"/g, '')
        const r = await client.query(`SELECT * FROM "${safe}" LIMIT 5`)
        sample = r.rows
      }
      await client.end()
      return NextResponse.json({ table: body.table, columns: cols.rows, sample })
    }

    const all = await client.query(
      `select table_schema, table_name, column_name, data_type
       from information_schema.columns
       where table_schema not in ('pg_catalog','information_schema')
       order by table_schema, table_name, ordinal_position`
    )
    await client.end()
    const map: Record<string, string[]> = {}
    for (const r of all.rows) {
      const key = `${r.table_schema}.${r.table_name}`
      ;(map[key] ??= []).push(`${r.column_name}:${r.data_type}`)
    }
    return NextResponse.json({ table_count: Object.keys(map).length, tables: map })
  } catch (err) {
    try { await client?.end() } catch { /* noop */ }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
