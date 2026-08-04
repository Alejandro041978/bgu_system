import { Download, ExternalLink } from 'lucide-react'

export const revalidate = 0

// ---------------------------------------------------------------------------
// Carta del Presidente de los Estados Unidos a los estudiantes, por el inicio
// del año académico 2026-2027.
//
// Se muestra el PDF ORIGINAL, no una transcripción. Es un documento firmado por
// un tercero: reescribirlo en HTML lo convertiría en una versión nuestra de sus
// palabras, y cualquier error de tipeo sería una cita falsa atribuida a un jefe
// de Estado. El visor incrustado deja ver el papel tal como se emitió, con su
// membrete y su firma.
// ---------------------------------------------------------------------------
const PDF = '/letters/president-letter-2026-2027.pdf'

export default function PresidentLetterPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">USA President Letter</h1>
        <p className="text-sm text-gray-500 mt-1">
          Carta del Presidente de los Estados Unidos a los estudiantes de las instituciones educativas
          americanas, con motivo del inicio del año académico <b>2026-2027</b>.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <a href={PDF} download
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
          <Download className="h-4 w-4" /> Descargar la carta
        </a>
        <a href={PDF} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
          <ExternalLink className="h-4 w-4" /> Abrir en una pestaña nueva
        </a>
      </div>

      {/* El visor del navegador falla en algunos móviles, así que debajo queda
          siempre el enlace de descarga como salida. */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
        <object data={PDF} type="application/pdf" className="h-[75vh] w-full min-h-[520px]">
          <div className="p-8 text-center">
            <p className="text-sm text-gray-600">
              Tu navegador no puede mostrar el PDF aquí dentro.
            </p>
            <a href={PDF} target="_blank" rel="noreferrer"
              className="mt-2 inline-block text-sm font-medium text-blue-600 underline">
              Abrir la carta en una pestaña nueva
            </a>
          </div>
        </object>
      </div>

      <p className="text-xs text-gray-400">
        Documento oficial reproducido sin modificaciones. Blackwell Global University lo comparte con su
        comunidad estudiantil a título informativo.
      </p>
    </div>
  )
}
