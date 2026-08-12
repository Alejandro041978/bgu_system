import { NextRequest } from 'next/server'
import { listar, editar } from '@/lib/scoped-grades-api'

export const revalidate = 0
export const maxDuration = 120

// Notas de los programas de campus externo: los que se dictan en otra
// institución y cuya calificación vive en el LMS de esa institución. El motor
// es el mismo de la otra página acotada (lib/scoped-grades-api); aquí solo se
// fija el ámbito.
export async function GET(req: NextRequest) { return listar('campus_externo', req) }
export async function PATCH(req: NextRequest) { return editar('campus_externo', req) }
