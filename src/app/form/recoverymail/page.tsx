import { RecoverymailForm } from '@/components/form/recoverymail-form'

export const revalidate = 0

export const metadata = {
  title: 'Recuperar correo institucional · Blackwell Global University',
  // Es una página de credenciales: no tiene por qué estar en un buscador.
  robots: { index: false, follow: false },
}

export default function RecoverymailPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-lg font-bold text-gray-900">Blackwell Global University</h1>
          <p className="text-sm text-gray-500 mt-0.5">Recuperar el acceso a tu correo institucional</p>
        </div>
        <RecoverymailForm />
        <p className="text-center text-xs text-gray-400 mt-6">
          ¿Problemas? Escribe a Servicios al Estudiante indicando tu número de documento.
        </p>
      </div>
    </div>
  )
}
