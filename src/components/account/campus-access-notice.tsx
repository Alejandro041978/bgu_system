import { GraduationCap } from 'lucide-react'

// ---------------------------------------------------------------------------
// Las reglas de acceso al Campus Virtual, al pie del estado de cuenta.
//
// Va aquí y no en un correo suelto porque es donde el estudiante mira cuando
// le importa: al ver lo que debe. Y el mismo texto se muestra en el ERP, para
// que quien atiende sepa exactamente qué se le prometió.
//
// El último párrafo no es relleno: el miedo de quien pierde el acceso es
// perder lo avanzado, y ese miedo es el que hace que la gente se desconecte
// del todo en vez de volver.
// ---------------------------------------------------------------------------
export function CampusAccessNotice() {
  return (
    <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50/70 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-gray-800">
        <GraduationCap className="h-4 w-4 text-gray-400" />
        Acceso al Campus Virtual
      </p>
      <div className="mt-2 space-y-2 text-[13px] leading-relaxed text-gray-600">
        <p>
          Tu acceso al Campus Virtual está ligado al pago de tus <b>cuotas de pensión</b>.
        </p>
        <p>
          Si una cuota vence y queda impaga, tu cuenta del campus se suspende hasta que regularices.
          <b> Al registrarse tu pago, el acceso se restablece de inmediato.</b>
        </p>
        <p>
          Si necesitas unos días, puedes solicitar una <b>tolerancia de 3 o 5 días</b> desde tu portal del
          estudiante, hasta <b>dos veces por semestre</b>. Durante ese plazo entras con normalidad.
        </p>
        <p>
          Otros conceptos —trámites, exámenes, documentos— <b>no afectan tu acceso</b>.
        </p>
        <p>
          La suspensión <b>no borra ni altera tus notas ni tu historial académico</b>: solo pausa el ingreso al
          aula. Todo tu avance te espera intacto.
        </p>
      </div>
    </div>
  )
}
