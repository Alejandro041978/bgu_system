import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

// La evaluación descarga PDFs + llama a Claude con documentos: puede tardar.
// Sin esto, Vercel corta la función y el registro queda atascado en "evaluating".
export const maxDuration = 300

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const RUBRIC = `
RÚBRICA DE IDONEIDAD DOCENTE (basada en AACRAO EDGE)

| Nivel a Enseñar | Criterio Principal | Requisito de Créditos | Criterio Alternativo |
|---|---|---|---|
| Pregrado / Bachelor (1° a 4° año) | Master's Degree o superior en la disciplina de enseñanza | Mínimo 18 horas crédito de posgrado (graduate semester hours) en la materia específica | Bachelor's + Certificaciones profesionales relevantes, licencias o más de 5 años de experiencia demostrable en el campo |
| Maestría / Master | Doctorado o Grado Terminal (Ph.D., Ed.D., D.B.A., etc.) en la disciplina | Especialización doctoral completa o Master's con rigurosa trayectoria de investigación | Master's + Récord sobresaliente de publicaciones indexadas, patentes o liderazgo ejecutivo de alto nivel en la industria |
| Doctorado / Doctorate | Ph.D. / Doctorado estrictamente equivalente al nivel de investigación terminal de EE.UU. | Línea de investigación activa y producción académica demostrada en los últimos 3-5 años | Excepcional: Solo investigadores de renombre internacional o creadores de tecnologías/teorías con amplia literatura publicada |

ESTADOS POSIBLES:
- approved: El docente cumple criterios para enseñar en al menos un nivel
- rejected: El docente NO cumple criterios para ningún nivel

NIVELES (solo si approved):
- bachelor: Puede enseñar únicamente en pregrado
- master: Puede enseñar en pregrado y maestría
- doctor: Puede enseñar en todos los niveles incluyendo doctorado
`

async function fetchFileAsBase64(url: string): Promise<{ base64: string; mediaType: string } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buffer = await res.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const contentType = res.headers.get('content-type') ?? 'application/pdf'
    return { base64, mediaType: contentType.split(';')[0] }
  } catch {
    return null
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = admin() as any

  // Get credential record
  const { data: cred, error: credError } = await db
    .from('faculty_credentials')
    .select('*, employee:hr_employees(full_name, position)')
    .eq('id', id)
    .single()

  if (credError || !cred) {
    return NextResponse.json({ error: 'Credencial no encontrada' }, { status: 404 })
  }

  if (!cred.cv_url && !cred.degree_url) {
    return NextResponse.json({ error: 'Debe subir al menos el CV y el grado de mayor jerarquía' }, { status: 400 })
  }

  // Mark as evaluating
  await db.from('faculty_credentials')
    .update({ status: 'evaluating', updated_at: new Date().toISOString() })
    .eq('id', id)

  // Fetch files as base64
  const contentBlocks: Anthropic.MessageParam['content'] = []

  contentBlocks.push({
    type: 'text',
    text: `Analiza las credenciales académicas del docente: ${cred.employee?.full_name ?? 'N/D'} (Cargo actual: ${cred.employee?.position ?? 'N/D'}).\n\nA continuación se presentan los documentos adjuntos para su evaluación.`,
  })

  if (cred.cv_url) {
    const file = await fetchFileAsBase64(cred.cv_url)
    if (file) {
      contentBlocks.push({
        type: 'document',
        source: { type: 'base64', media_type: file.mediaType as 'application/pdf', data: file.base64 },
        title: `CV - ${cred.cv_name ?? 'curriculum.pdf'}`,
      } as any)
    }
  }

  if (cred.degree_url) {
    const file = await fetchFileAsBase64(cred.degree_url)
    if (file) {
      contentBlocks.push({
        type: 'document',
        source: { type: 'base64', media_type: file.mediaType as 'application/pdf', data: file.base64 },
        title: `Grado Principal - ${cred.degree_name ?? 'grado.pdf'}`,
      } as any)
    }
  }

  if (cred.second_title_url) {
    const file = await fetchFileAsBase64(cred.second_title_url)
    if (file) {
      contentBlocks.push({
        type: 'document',
        source: { type: 'base64', media_type: file.mediaType as 'application/pdf', data: file.base64 },
        title: `Segundo Título - ${cred.second_title_name ?? 'titulo2.pdf'}`,
      } as any)
    }
  }

  contentBlocks.push({
    type: 'text',
    text: `
Con base en los documentos anteriores, aplica la siguiente rúbrica:

${RUBRIC}

Responde ÚNICAMENTE en formato JSON con esta estructura exacta:
{
  "status": "approved" | "rejected",
  "approved_level": "bachelor" | "master" | "doctor" | null,
  "summary": "Resumen ejecutivo en 2-3 oraciones",
  "analysis": {
    "highest_degree": "Grado académico más alto identificado",
    "field": "Campo o disciplina del grado",
    "experience_years": "Años de experiencia estimados si aplica",
    "meets_bachelor": true | false,
    "meets_master": true | false,
    "meets_doctor": true | false,
    "reasoning": "Explicación detallada de la decisión con referencia a la rúbrica"
  }
}

No incluyas texto fuera del JSON.`,
  })

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  let result: {
    status: 'approved' | 'rejected'
    approved_level: 'bachelor' | 'master' | 'doctor' | null
    summary: string
    analysis: {
      highest_degree: string
      field: string
      experience_years: string
      meets_bachelor: boolean
      meets_master: boolean
      meets_doctor: boolean
      reasoning: string
    }
  }

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 2048,
      messages: [{ role: 'user', content: contentBlocks }],
      system: 'Eres un evaluador experto en credenciales académicas universitarias. Tu tarea es determinar si un docente cumple los criterios de idoneidad de AACRAO EDGE para enseñar en programas de pregrado, maestría o doctorado. Siempre respondes únicamente con JSON válido.',
    })

    const text = response.content.find(b => b.type === 'text')?.text ?? ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')
    result = JSON.parse(jsonMatch[0])
  } catch (err) {
    await db.from('faculty_credentials')
      .update({ status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', id)
    return NextResponse.json({ error: 'Error en evaluación IA: ' + String(err) }, { status: 500 })
  }

  // Build full report text
  const report = `REPORTE DE EVALUACIÓN DE IDONEIDAD DOCENTE
==========================================
Docente: ${cred.employee?.full_name ?? 'N/D'}
Cargo: ${cred.employee?.position ?? 'N/D'}
Fecha evaluación: ${new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })}

RESULTADO: ${result.status === 'approved' ? `APROBADO — Nivel: ${result.approved_level?.toUpperCase()}` : 'RECHAZADO'}

RESUMEN
-------
${result.summary}

ANÁLISIS DETALLADO
------------------
Grado académico más alto: ${result.analysis.highest_degree}
Disciplina/Campo: ${result.analysis.field}
Experiencia estimada: ${result.analysis.experience_years}

Criterios cumplidos:
• Pregrado / Bachelor: ${result.analysis.meets_bachelor ? '✓ Apto' : '✗ No cumple'}
• Maestría / Master:   ${result.analysis.meets_master ? '✓ Apto' : '✗ No cumple'}
• Doctorado:           ${result.analysis.meets_doctor ? '✓ Apto' : '✗ No cumple'}

FUNDAMENTACIÓN
--------------
${result.analysis.reasoning}

RÚBRICA APLICADA (AACRAO EDGE)
-------------------------------
${RUBRIC}
`

  // Save result
  await db.from('faculty_credentials').update({
    status: result.status,
    approved_level: result.approved_level ?? null,
    ai_report: report,
    evaluated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  return NextResponse.json({ status: result.status, approved_level: result.approved_level, summary: result.summary, ai_report: report, evaluated_at: new Date().toISOString() })
}
