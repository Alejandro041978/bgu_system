import { GraduateSurveyForm } from '@/components/form/graduate-survey-form'

export const revalidate = 0

// Encuesta pública de titulados: el token identifica al estudiante (nominal).
export default async function GraduateSurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <GraduateSurveyForm token={token} />
}
