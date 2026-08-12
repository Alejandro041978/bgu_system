import { NextRequest } from 'next/server'
import { listar, editar } from '@/lib/scoped-grades-api'

export const revalidate = 0
export const maxDuration = 120

// Notas de capstone: la calificación sale de la defensa del trabajo final, no
// del aula. El aula acompaña y da acceso, pero no evalúa ni sincroniza.
export async function GET(req: NextRequest) { return listar('capstone', req) }
export async function PATCH(req: NextRequest) { return editar('capstone', req) }
