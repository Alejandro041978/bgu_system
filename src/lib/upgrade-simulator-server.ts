import { carreraKey, veredicto, type Veredicto, type Familia } from './upgrade-simulator'

// ---------------------------------------------------------------------------
// Lado servidor del simulador Upgrade: consultas compartidas por la API
// pública (/api/form) y la interna (/api/admissions). La pública NUNCA expone
// datos de contacto de institutos: solo nombre, ubicación y carreras.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export interface InstitutoPublico {
  codigo_modular: string; nombre: string; licenciado: boolean
  tipo: string | null; gestion: string | null
  departamento: string | null; provincia: string | null; distrito: string | null
  fuente: string | null
}

export async function departamentos(sb: SB): Promise<string[]> {
  const { data } = await sb.from('upgrade_institutes').select('departamento').not('departamento', 'is', null)
  return [...new Set((data ?? []).map((r: { departamento: string }) => String(r.departamento).trim()).filter(Boolean))].sort() as string[]
}

export async function buscarInstitutos(sb: SB, q: string, departamento: string | null): Promise<InstitutoPublico[]> {
  const texto = String(q ?? '').trim()
  if (texto.length < 2) return []
  let query = sb.from('upgrade_institutes')
    .select('codigo_modular, nombre, licenciado, tipo, gestion, departamento, provincia, distrito, fuente')
    .ilike('nombre', `%${texto.replace(/[%_]/g, '')}%`)
    .order('licenciado', { ascending: false }).order('nombre').limit(25)
  if (departamento) query = query.eq('departamento', departamento)
  const { data } = await query
  return (data ?? []) as InstitutoPublico[]
}

export interface CarreraDeInstituto {
  carrera_key: string; nombre: string; familia: Familia
  califica_admin: boolean; califica_conta: boolean
}

export async function institutoConCarreras(sb: SB, codigo: string): Promise<{ instituto: InstitutoPublico | null; carreras: CarreraDeInstituto[] }> {
  const { data: inst } = await sb.from('upgrade_institutes')
    .select('codigo_modular, nombre, licenciado, tipo, gestion, departamento, provincia, distrito, fuente')
    .eq('codigo_modular', codigo).maybeSingle()
  if (!inst) return { instituto: null, carreras: [] }
  const { data: progs } = await sb.from('upgrade_institute_programs')
    .select('carrera_key, carrera:upgrade_careers(carrera_key, nombre, familia, califica_admin, califica_conta)')
    .eq('codigo_modular', codigo)
  const carreras = ((progs ?? []) as { carrera: CarreraDeInstituto | null }[])
    .map(p => p.carrera).filter((c): c is CarreraDeInstituto => !!c)
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
  return { instituto: inst as InstitutoPublico, carreras }
}

export interface SimulacionInput {
  codigo_modular: string
  carrera_key?: string | null
  carrera_texto?: string | null
  // contacto (opcional): si viene, se guarda como interesado
  nombre?: string | null
  whatsapp?: string | null
  email?: string | null
  origen: 'publico' | 'erp'
}

export async function simular(sb: SB, input: SimulacionInput): Promise<{ veredicto: Veredicto; instituto: InstitutoPublico | null; carrera: CarreraDeInstituto | null; lead_id: string | null }> {
  const { instituto, carreras } = await institutoConCarreras(sb, input.codigo_modular)
  let carrera: CarreraDeInstituto | null = null
  if (input.carrera_key) carrera = carreras.find(c => c.carrera_key === input.carrera_key) ?? null
  // Carrera escrita a mano: si su clave existe en el catálogo (la estudió en
  // otro instituto o el censo no la trae), se usa la regla del catálogo.
  if (!carrera && input.carrera_texto) {
    const key = carreraKey(input.carrera_texto)
    if (key) {
      const { data } = await sb.from('upgrade_careers')
        .select('carrera_key, nombre, familia, califica_admin, califica_conta').eq('carrera_key', key).maybeSingle()
      if (data) carrera = data as CarreraDeInstituto
    }
  }
  const v = veredicto({ instituto, carrera, carreraTexto: input.carrera_texto ?? null })

  // Toda simulación se registra (mide demanda); con contacto es un interesado.
  let leadId: string | null = null
  try {
    const { data } = await sb.from('upgrade_simulator_leads').insert({
      origen: input.origen,
      nombre: input.nombre?.trim() || null,
      whatsapp: input.whatsapp?.trim() || null,
      email: input.email?.trim().toLowerCase() || null,
      codigo_modular: instituto?.codigo_modular ?? input.codigo_modular,
      instituto_nombre: instituto?.nombre ?? null,
      carrera_key: carrera?.carrera_key ?? null,
      carrera_texto: input.carrera_texto?.trim() || null,
      veredicto: v,
    }).select('id').single()
    leadId = data?.id ?? null
  } catch { /* la bitácora no bloquea el veredicto */ }
  return { veredicto: v, instituto, carrera, lead_id: leadId }
}
