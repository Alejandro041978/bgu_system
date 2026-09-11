import { EmployerSurveyForm } from '@/components/form/employer-survey-form'

export const revalidate = 0

// Página PÚBLICA (bajo /form/*, exenta de sesión): la abre el empleador desde
// el enlace único que le envía Camila por WhatsApp.
export default async function EmployerSurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <EmployerSurveyForm token={token} />
}
