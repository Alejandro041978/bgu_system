import { redirect } from 'next/navigation'

// Ruta renombrada a inglés (universidad americana): /academic/students.
// Este redirect conserva los marcadores y enlaces compartidos viejos.
export default async function EstudiantesRedirect({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams
  redirect(`/academic/students${id ? `?id=${id}` : ''}`)
}
