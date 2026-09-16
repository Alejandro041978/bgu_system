import { UpgradeSimulatorCore } from '@/components/admissions/upgrade-simulator-core'

export const revalidate = 0

// Página PÚBLICA (bajo /form/*, sin sesión), pensada para incrustarse por
// iframe en la web institucional. Solo español (postulantes peruanos).
export default function UpgradeSimulatorPublicPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-gradient-to-r from-[#1a34a8] to-blue-600 text-white rounded-t-2xl px-6 py-5 text-center">
          <h1 className="text-lg font-bold">¿Califico para la convalidación Upgrade?</h1>
          <p className="text-blue-100 text-sm mt-0.5">Blackwell Global University · Bachelors en Administración y Contabilidad</p>
        </div>
        <div className="bg-white border border-gray-200 border-t-0 rounded-b-2xl p-5">
          <p className="text-sm text-gray-600 mb-4 leading-relaxed">
            Si egresaste de un instituto tecnológico <b>licenciado por MINEDU</b> en una carrera de Administración,
            Contabilidad o afines, puedes convalidar tus estudios y terminar tu Bachelor en menos tiempo. Verifícalo aquí en un minuto.
          </p>
          <UpgradeSimulatorCore apiBase="/api/form/upgrade-simulator" captura />
          <p className="text-[11px] text-gray-400 mt-4">
            Fuente: listado de institutos licenciados MINEDU y Censo Educativo 2025. El resultado es orientativo; la convalidación
            definitiva la determina Admisión con tu certificado de estudios.
          </p>
        </div>
      </div>
    </div>
  )
}
