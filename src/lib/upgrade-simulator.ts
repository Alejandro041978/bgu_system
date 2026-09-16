// ---------------------------------------------------------------------------
// Simulador de convalidación UPGRADE (16/09/2026).
//
// Reglas del usuario:
//   · Solo acceden a Blackwell los egresados de institutos LICENCIADOS (MINEDU).
//   · Bachelor en Contabilidad: solo quien estudió Contabilidad.
//   · Bachelor en Administración: Administración y carreras afines (bancaria,
//     marketing, RR.HH., logística, comercial, hotelería/turismo, publicidad,
//     gestión pública, gestión de producción, asistencia administrativa) y
//     también Contabilidad. Secretariado NO; salud, TI, ingeniería... NO.
//
// La regla VIVE en el catálogo upgrade_careers (editable por Registros). Lo
// que hay aquí es (1) la normalización de nombres, (2) la clasificación
// AUTOMÁTICA inicial con la que se siembra el catálogo (queda marcada como
// no revisada donde el nombre es ambiguo) y (3) el veredicto.
// ---------------------------------------------------------------------------

export type Familia = 'contabilidad' | 'administracion' | 'afin' | 'no_afin' | 'sin_clasificar'

export const BACHELORS = {
  admin: 'Bachelor of Science in Business Administration',
  conta: 'Bachelor of Arts in Accounting',
} as const

// Nombre → clave estable: mayúsculas, sin tildes, sin puntuación, espacios
// simples. "ADMINISTRACION DE EMPRESAS" y "ADMINISTRACIÓN DE EMPRESAS" caen
// en la misma clave.
// Marcas diacríticas (U+0300–U+036F) construidas por código de carácter: un
// rango escrito con los caracteres combinantes literales en el fuente se
// interpretaba distinto en la compilación de Vercel (las tildes no se quitaban
// y "Enfermería" no encontraba su clave).
const DIACRITICOS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g')

export function carreraKey(nombre: string): string {
  return String(nombre ?? '')
    .normalize('NFD').replace(DIACRITICOS, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface Clasificacion {
  familia: Familia
  califica_admin: boolean
  califica_conta: boolean
  revisado: boolean
  nota: string | null
}

// Clasificación automática por palabras clave. Conservadora: lo que no
// reconoce queda 'no_afin' SIN revisar, para que Registros lo mire.
export function clasificarCarrera(key: string): Clasificacion {
  const k = ` ${key} `
  const tiene = (...pal: string[]) => pal.some(p => k.includes(` ${p}`) || k.includes(`${p} `) || k.includes(p))

  if (!key || key === 'OTROS') return { familia: 'sin_clasificar', califica_admin: false, califica_conta: false, revisado: false, nota: 'Nombre genérico: requiere evaluación' }

  // Contabilidad → ambos bachelors (regla del usuario)
  if (tiene('CONTABILIDAD', 'CONTABLE')) {
    return { familia: 'contabilidad', califica_admin: true, califica_conta: true, revisado: true, nota: null }
  }
  // Exclusiones explícitas antes de mirar "administración"
  if (tiene('SECRETARIADO')) return { familia: 'no_afin', califica_admin: false, califica_conta: false, revisado: true, nota: 'Excluida por regla (secretariado)' }
  const esTI = tiene('REDES', 'SISTEMAS', 'COMPUTO', 'COMPUTACION', 'INFORMATICA', 'SOFTWARE', 'DATOS', 'PLATAFORMAS')
  if (esTI) return { familia: 'no_afin', califica_admin: false, califica_conta: false, revisado: true, nota: null }
  const esAgroForestal = tiene('FORESTAL', 'AGROPECUARI', 'PESQUER', 'ACUICOL')
  const esPolicialNaval = tiene('POLICIAL', 'NAVAL', 'MARINA', 'MILITAR')

  // Administración propiamente dicha (incluye "ADMINISTRACIÓN" a secas y
  // negocios internacionales/digitales)
  if (key === 'ADMINISTRACION' || tiene('ADMINISTRACION DE EMPRESAS', 'ADMINISTRACION Y DIRECCION DE NEGOCIOS', 'GESTION ADMINISTRATIVA',
      'ADMINISTRACION DE NEGOCIOS', 'NEGOCIOS INTERNACIONALES', 'NEGOCIOS DIGITALES', 'ADMINISTRACION Y NEGOCIOS')) {
    if (esAgroForestal || esPolicialNaval) return { familia: 'afin', califica_admin: true, califica_conta: false, revisado: false, nota: 'Administración con mención sectorial: confirmar' }
    return { familia: 'administracion', califica_admin: true, califica_conta: false, revisado: true, nota: null }
  }
  // Afines aprobadas por el usuario
  if (tiene('BANCARI', 'FINANCIER', 'MARKETING', 'PUBLICIDAD', 'PUBLICITARI', 'RECURSOS HUMANOS', 'LOGISTIC', 'COMERCIAL', 'COMERCIO',
            'HOTELER', 'HOSTELER', 'HOTELES', 'RESTAURANTES', 'TURISTIC', 'TURISMO', 'GESTION PUBLICA', 'ASISTENCIA ADMINISTRATIVA', 'ASISTENCIA DE DIRECCION',
            'GESTION DE LA PRODUCCION', 'GESTION DE PRODUCCION', 'PRODUCCION Y GESTION INDUSTRIAL', 'ADMINISTRACION TURISTICA', 'ADMINISTRACION HOTELERA',
            'ADMINISTRACION INDUSTRIAL', 'CADENA DE SUMINISTRO', 'TRANSPORTE Y DISTRIBUCION')) {
    // "Guía oficial de turismo" no es gestión: se marca para revisar
    if (tiene('GUIA')) return { familia: 'no_afin', califica_admin: false, califica_conta: false, revisado: false, nota: 'Turismo operativo, no gestión: confirmar' }
    // "Diseño publicitario" es diseño antes que publicidad: califica, pero se confirma
    if (tiene('DISENO')) return { familia: 'afin', califica_admin: true, califica_conta: false, revisado: false, nota: 'Diseño con giro publicitario: confirmar' }
    return { familia: 'afin', califica_admin: true, califica_conta: false, revisado: true, nota: null }
  }
  // Otras "administración de …" (recursos forestales, centro de cómputo ya
  // excluido, operaciones…): ambiguas → para revisar
  if (tiene('ADMINISTRACION', 'GESTION')) {
    return { familia: 'no_afin', califica_admin: false, califica_conta: false, revisado: false, nota: 'Contiene administración/gestión con giro sectorial: confirmar' }
  }
  return { familia: 'no_afin', califica_admin: false, califica_conta: false, revisado: true, nota: null }
}

// ── Veredicto ──────────────────────────────────────────────────────────────
export type VeredictoTipo = 'no_licenciado' | 'califica' | 'no_califica_carrera' | 'evaluacion'

export interface Veredicto {
  tipo: VeredictoTipo
  bachelors: ('admin' | 'conta')[]   // a cuáles califica (solo si tipo = califica)
  titulo: string
  detalle: string
}

export function veredicto(args: {
  instituto: { nombre: string; licenciado: boolean } | null
  carrera: { nombre: string; familia: Familia; califica_admin: boolean; califica_conta: boolean } | null
  carreraTexto?: string | null
}): Veredicto {
  const { instituto, carrera } = args
  if (!instituto || !instituto.licenciado) {
    return {
      tipo: 'no_licenciado', bachelors: [],
      titulo: 'Tu instituto no está licenciado por MINEDU',
      detalle: 'Solo los egresados de institutos licenciados pueden convalidar sus estudios en Blackwell Global University. Si crees que hay un error en el registro, escríbenos.',
    }
  }
  if (!carrera || carrera.familia === 'sin_clasificar') {
    return {
      tipo: 'evaluacion', bachelors: [],
      titulo: 'Tu instituto está licenciado — tu carrera requiere evaluación',
      detalle: 'No tenemos tu carrera registrada en el censo de tu instituto. Déjanos tus datos y Admisión evaluará tu caso con tu certificado de estudios.',
    }
  }
  const bachelors: ('admin' | 'conta')[] = []
  if (carrera.califica_admin) bachelors.push('admin')
  if (carrera.califica_conta) bachelors.push('conta')
  if (!bachelors.length) {
    return {
      tipo: 'no_califica_carrera', bachelors: [],
      titulo: 'Tu instituto está licenciado, pero tu carrera no califica para Upgrade',
      detalle: `La convalidación Upgrade aplica a carreras de Administración, Contabilidad y afines. "${carrera.nombre}" no está dentro de ese grupo. Puedes postular a nuestros Bachelors por la vía regular.`,
    }
  }
  const nombres = bachelors.map(b => BACHELORS[b])
  return {
    tipo: 'califica', bachelors,
    titulo: `¡Calificas para la convalidación Upgrade!`,
    detalle: `Como egresado/a de "${carrera.nombre}" en un instituto licenciado, puedes convalidar tus estudios en: ${nombres.join(' y ')}.`,
  }
}
