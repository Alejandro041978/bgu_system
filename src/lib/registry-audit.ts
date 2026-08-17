import { estadoDeNota } from './course-enrollments'

// ---------------------------------------------------------------------------
// Auditor del registro curricular.
//
// El 15 de agosto de 2026 el registro por asignatura pasó a ser la fuente de
// qué tiene inscrito un estudiante, y de ahí sale el precio oficial. Antes eso
// se deducía de que existiera una fila en la tabla de notas, lo que obligaba a
// crear 4.111 filas sin calificación dentro de las calificaciones.
//
// El riesgo del modelo nuevo no es que falle de golpe: es que las dos tablas se
// separen despacio y nadie lo note hasta que un precio salga raro. Los
// contrastes de aquí son los que se corrieron a mano durante la migración; esto
// los deja corriendo solos.
//
// Cada uno tiene un valor esperado. Cuatro están en cero y el de los semestres
// heredados arrastra 629 casos de SystemActiva que nadie va a reescribir. Lo
// que importa no es que sean cero, sino que no SUBAN. Ninguno se compara
// consigo mismo: eso los dejaba en verde por construcción.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export interface Hallazgo {
  clave: string
  titulo: string
  explica: string
  // Qué significa que este número crezca.
  siSube: string
  n: number
  esperado: number
  ejemplos: string[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todo(sb: SB, tabla: string, cols: string, orden: string): Promise<any[]> {
  const out: unknown[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(tabla).select(cols).order(orden).range(from, from + 999)
    // Un fallo NO puede devolver lista vacía: la pantalla diría "todo en orden",
    // que es la mentira más cara de este ERP.
    if (error) throw new Error(`${tabla}: ${error.message}`)
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return out as any[]
}

export async function auditarRegistro(sb: SB): Promise<{ hallazgos: Hallazgo[]; totales: Record<string, number> }> {
  const [notas, ce, est, cursos, progs, cats, sems, enr] = await Promise.all([
    todo(sb, 'academic_grades', 'external_id, document_number, student_name, course_id, course_name, source, withdrawn_at, final_grade, retake_grade, passing_score, semester_id, course_enrollment_id, intento', 'external_id'),
    todo(sb, 'academic_course_enrollments', 'id, student_id, course_id, attempt, status, semester_id', 'id'),
    todo(sb, 'academic_students', 'id, document_number', 'id'),
    todo(sb, 'academic_courses', 'id, program_id, name', 'id'),
    todo(sb, 'academic_programs', 'id, name, category_id', 'id'),
    todo(sb, 'academic_programs_category', 'id, passing_score', 'id'),
    todo(sb, 'academic_semesters', 'id, name, end_date', 'id'),
    todo(sb, 'academic_student_enrollments', 'student_id, program_id, enrollment_date', 'id'),
  ])

  const sidPorDoc = new Map<string, string>(est.map(e => [String(e.document_number), String(e.id)]))
  const progDeCurso = new Map<string, string>(cursos.map(c => [String(c.id), String(c.program_id)]))
  const nomCurso = new Map<string, string>(cursos.map(c => [String(c.id), String(c.name)]))
  const minCat = new Map<string, number | null>(cats.map(c => [String(c.id), c.passing_score]))
  const minProg = new Map<string, number | null>(progs.map(p => [String(p.id), minCat.get(String(p.category_id)) ?? null]))
  const semFin = new Map<string, string | null>(sems.map(s => [String(s.id), s.end_date]))
  const semNom = new Map<string, string>(sems.map(s => [String(s.id), String(s.name)]))
  const ingreso = new Map<string, string>()
  for (const e of enr) {
    const d = e.enrollment_date ? String(e.enrollment_date).slice(0, 10) : null
    if (!d) continue
    const k = `${e.student_id}|${e.program_id}`
    if (!ingreso.has(k) || d < ingreso.get(k)!) ingreso.set(k, d)
  }

  // ---- 1. Notas no enganchadas a su matrícula ------------------------------
  //
  // Dos formas de estar suelta, y las dos importan:
  //   a) no hay matrícula para ese par (estudiante, asignatura)
  //   b) la hay, pero la nota no apunta a ella (course_enrollment_id vacío)
  // La (b) parecía inofensiva y no lo es: el contraste 2 recorre las notas por
  // course_enrollment_id, así que una nota sin ligar deja a su matrícula sin
  // vigilancia — puede quedarse con un estado viejo y nadie se entera.
  const claveCE = new Set(ce.map(r => `${r.student_id}|${r.course_id}`))
  const sinMatricula: string[] = []
  let nSinMatricula = 0
  for (const n of notas) {
    if (n.withdrawn_at || !n.course_id) continue
    const sid = sidPorDoc.get(String(n.document_number))
    if (!sid) continue
    if (!claveCE.has(`${sid}|${n.course_id}`)) {
      nSinMatricula++
      if (sinMatricula.length < 10) sinMatricula.push(`${n.student_name} · ${n.course_name} · no tiene matrícula`)
    } else if (!n.course_enrollment_id) {
      nSinMatricula++
      if (sinMatricula.length < 10) sinMatricula.push(`${n.student_name} · ${n.course_name} · la matrícula existe, la nota no apunta a ella`)
    }
  }

  // ---- 2. El estado de la matrícula no sigue a su nota --------------------
  const notaDeMat = new Map<string, Record<string, unknown> & { v: number | null }>()
  for (const n of notas) {
    if (!n.course_enrollment_id) continue
    const k = String(n.course_enrollment_id)
    const v = (n.retake_grade ?? n.final_grade) as number | null
    const prev = notaDeMat.get(k)
    if (!prev || (v != null && (prev.v == null || Number(v) > Number(prev.v)))) notaDeMat.set(k, { ...n, v })
  }
  const desfase: string[] = []
  let nDesfase = 0
  for (const r of ce) {
    const n = notaDeMat.get(String(r.id))
    if (!n) continue
    const min = minProg.get(progDeCurso.get(String(r.course_id)) ?? '') ?? null
    const esperado = estadoDeNota(n as never, min)
    if (esperado === r.status) continue
    nDesfase++
    if (desfase.length < 10) {
      desfase.push(`${n.student_name} · ${nomCurso.get(String(r.course_id)) ?? ''} · dice ${r.status}, la nota (${n.v ?? '—'}) dice ${esperado}`)
    }
  }

  // ---- 3. Notas en un semestre que cerró antes del ingreso ----------------
  const cerrado: string[] = []
  let nCerrado = 0
  for (const n of notas) {
    if (n.withdrawn_at || !n.semester_id || !n.course_id) continue
    const sid = sidPorDoc.get(String(n.document_number))
    const prog = progDeCurso.get(String(n.course_id))
    const i = sid && prog ? ingreso.get(`${sid}|${prog}`) : null
    const fin = semFin.get(String(n.semester_id))
    if (!i || !fin || String(fin).slice(0, 10) >= i) continue
    nCerrado++
    if (cerrado.length < 10) {
      cerrado.push(`${n.student_name} · ${n.course_name} · ingresó ${i}, figura en ${semNom.get(String(n.semester_id))} (cerró ${String(fin).slice(0, 10)})`)
    }
  }

  // ---- 5. Notas sin asignatura de la malla --------------------------------
  //
  // Este contraste nació de un agujero del contraste 1: empieza saltando las
  // filas sin course_id, así que era ciego justo a las rotas. Una nota sin
  // asignatura no cuenta en el precio oficial y ningún otro contraste la ve;
  // el acta la enseñaba igual porque, a falta de course_id, empareja por
  // nombre — una red que ocultaba el error en vez de avisarlo.
  const sinCurso: string[] = []
  let nSinCurso = 0
  for (const n of notas) {
    if (n.withdrawn_at || n.course_id) continue
    nSinCurso++
    if (sinCurso.length < 10) {
      sinCurso.push(`${n.student_name} · ${n.course_name} · ${n.source}${n.course_enrollment_id ? ' (su matrícula sí la tiene)' : ''}`)
    }
  }

  // ---- 6. Intentos duplicados o mal numerados -----------------------------
  //
  // Un recursado es cursar la misma asignatura en OTRO periodo. Dos intentos
  // de la misma asignatura en el MISMO semestre no son dos: son una
  // inscripción contada dos veces, y así fue como el registro llegó a decir
  // 855 recursados cuando eran 796.
  //
  // El número de intento también tiene que decir la verdad: se ordena por
  // periodo, y el 'intento' que guarda la nota debe ser el mismo que el
  // 'attempt' de su matrícula. Si discrepan, el acta rotula "Recursado 1" lo
  // que en realidad fue el primer intento.
  const matriculasConNota = new Set<string>()
  for (const n of notas) if (n.course_enrollment_id) matriculasConNota.add(String(n.course_enrollment_id))
  // La mejor nota CALIFICADA de cada matrícula, para el contraste 7.
  const notasDeMatricula = new Map<string, { valor: number; fuente: string }[]>()
  for (const n of notas) {
    if (!n.course_enrollment_id || n.withdrawn_at) continue
    const v = (n.retake_grade ?? n.final_grade) as number | null
    if (v == null) continue
    const k = String(n.course_enrollment_id)
    const prev = notasDeMatricula.get(k)
    if (!prev || Number(v) > prev[0].valor) notasDeMatricula.set(k, [{ valor: Number(v), fuente: String(n.source) }])
  }
  const dupIntento: string[] = []
  let nDupIntento = 0
  const porPar = new Map<string, typeof ce>()
  for (const r of ce) {
    // Las retiradas quedan fuera: retirarse de una asignatura y volver a
    // inscribirse en el mismo periodo es una secuencia normal, no un duplicado.
    if (r.status === 'retirada') continue
    const k = `${r.student_id}|${r.course_id}`
    if (!porPar.has(k)) porPar.set(k, [])
    porPar.get(k)!.push(r)
  }
  for (const [, filas] of porPar) {
    if (filas.length < 2) continue
    const porSemestre = new Map<string, typeof filas>()
    for (const f of filas) {
      const s = String(f.semester_id ?? 'sin')
      if (!porSemestre.has(s)) porSemestre.set(s, [])
      porSemestre.get(s)!.push(f)
    }
    for (const [s, grupo] of porSemestre) {
      if (grupo.length < 2 || s === 'sin') continue
      // Solo cuentan las que NO tienen nota: ésas son inequívocamente una
      // inscripción contada dos veces, y son las 59 que se borraron el 15-08.
      // Cuando los dos intentos traen calificación propia el caso es otro
      // —dos notas de Activa del mismo curso y periodo— y se mira aparte: aquí
      // no se puede decidir cuál sobra sin inventárselo.
      const sinNota = grupo.filter(f => !matriculasConNota.has(String(f.id)))
      if (!sinNota.length) continue
      nDupIntento += sinNota.length
      if (dupIntento.length < 10) {
        const c = nomCurso.get(String(grupo[0].course_id)) ?? ''
        dupIntento.push(`${c} · ${grupo.length} intentos en ${semNom.get(s) ?? s}, ${sinNota.length} sin ninguna nota`)
      }
    }
  }
  const attemptDe = new Map<string, number>(ce.map(r => [String(r.id), Number(r.attempt)]))
  for (const n of notas) {
    if (n.withdrawn_at || !n.course_enrollment_id) continue
    const a = attemptDe.get(String(n.course_enrollment_id))
    if (a == null || Number(n.intento ?? 1) === a) continue
    nDupIntento++
    if (dupIntento.length < 10) {
      dupIntento.push(`${n.student_name} · ${n.course_name} · la nota dice intento ${n.intento ?? 1} y su matrícula ${a}`)
    }
  }

  // ---- 7. Dos calificaciones de la misma asignatura en el mismo periodo ---
  //
  // No es un error resuelto: es una pregunta abierta que se mide para que no
  // crezca. La misma asignatura, el mismo semestre y DOS notas: 163 son un
  // cruce Moodle + SystemActiva —la misma cursada anotada en los dos sistemas
  // durante la migración— y 117 son dos filas de Activa entre sí.
  //
  // El acta no enseña nada mal: se queda con la más alta. Lo que está mal es
  // el conteo de recursados, que cuenta 286 que probablemente no lo sean.
  //
  // No se fusionan todavía por decisión del usuario (16-08-2026): en 108 de
  // ellos las dos notas caen a lados distintos del mínimo, así que elegir mal
  // convierte un aprobado en reprobado. Se revisan buscando el patrón antes de
  // tocar nada, y hasta entonces lo único que no puede pasar es que suban.
  const dobleNota: string[] = []
  let nDobleNota = 0
  for (const [, filas] of porPar) {
    if (filas.length < 2) continue
    const porSemestre2 = new Map<string, typeof filas>()
    for (const f of filas) {
      const s = String(f.semester_id ?? 'sin')
      if (s === 'sin') continue
      if (!porSemestre2.has(s)) porSemestre2.set(s, [])
      porSemestre2.get(s)!.push(f)
    }
    for (const [s, grupo] of porSemestre2) {
      if (grupo.length < 2) continue
      const calificadas = grupo.filter(f => (notasDeMatricula.get(String(f.id)) ?? []).length > 0)
      if (calificadas.length < 2) continue
      nDobleNota += calificadas.length - 1
      if (dobleNota.length < 10) {
        const notasDe = calificadas.map(f => {
          const v = (notasDeMatricula.get(String(f.id)) ?? [])
          return `${v[0].valor} (${v[0].fuente})`
        })
        dobleNota.push(`${nomCurso.get(String(grupo[0].course_id)) ?? ''} · ${semNom.get(s) ?? s} · ${notasDe.join(' vs ')}`)
      }
    }
  }

  // ---- 4. Inscripciones que siguen en la tabla de notas -------------------
  const inscripciones = notas.filter(n => !n.withdrawn_at && (n.retake_grade ?? n.final_grade) == null)
  const porFuente = new Map<string, number>()
  for (const n of inscripciones) porFuente.set(String(n.source), (porFuente.get(String(n.source)) ?? 0) + 1)

  const hallazgos: Hallazgo[] = [
    {
      clave: 'sin_matricula',
      titulo: 'Notas no enganchadas a su matrícula',
      explica: 'O la asignatura no está en el registro del estudiante —y entonces no cuenta en su precio oficial— o la matrícula existe pero la nota no apunta a ella, y ese caso deja a la matrícula fuera de toda vigilancia.',
      siSube: 'Algún camino de escritura está creando notas sin abrir la matrícula o sin ligarlas. Los tres conocidos —Moodle, el editor y la reconstrucción— hacen las dos cosas.',
      n: nSinMatricula, esperado: 0, ejemplos: sinMatricula,
    },
    {
      clave: 'estado_desfasado',
      titulo: 'El estado de la matrícula no coincide con su nota',
      explica: 'La matrícula dice aprobada y la nota es reprobatoria, o al revés. De este estado leen los egresados y los carruseles.',
      // Cero desde el 15-08-2026. Los 8 de base eran las notas de "Assessment
      // of the Individual and the Environment": Dirección confirmó que es la
      // asignatura que hoy se llama Psychological First Aid en Clinical
      // Psychology, se les escribió el course_id y el desfase se cerró.
      siSube: 'Se corrigió una nota sin sincronizar su matrícula. El cron nocturno lo cura solo; si crece entre corridas, hay un escritor que no lo hace. Ojo con las asignaturas con dos notas: el estado sale de la MÁS ALTA, igual que el acta.',
      n: nDesfase, esperado: 0, ejemplos: desfase,
    },
    {
      clave: 'semestre_cerrado',
      titulo: 'Notas en un semestre que cerró antes de que el estudiante ingresara',
      explica: 'El periodo de la nota es anterior a su matrícula: cursó algo en un semestre en el que todavía no existía como estudiante.',
      // Fijo en 698, no en sí mismo: comparado consigo mismo el contraste
      // estaba en verde por construcción y no habría avisado nunca. Son 666 tras sacar las inscripciones sin calificar de la tabla el
      // 15-08: nadie va a reescribir esos periodos de SystemActiva.
      siSube: 'Deuda heredada de SystemActiva. Sube de a uno sin que nada esté roto cuando alguien se matricula en un SEGUNDO programa que comparte asignaturas: su nota vieja pasa a colgar también de la malla nueva, cuyo ingreso es posterior. Un salto grande sí sería un fechado malo.',
      n: nCerrado, esperado: 629, ejemplos: cerrado,
    },
    {
      clave: 'sin_asignatura',
      titulo: 'Notas que no apuntan a ninguna asignatura de la malla',
      explica: 'La nota guarda el nombre del curso pero no su course_id. No cuenta en el precio oficial, y el acta la enseña solo porque, a falta de id, empareja por nombre.',
      siSube: 'Un importador está escribiendo notas sin resolver la asignatura. El de Moodle la resuelve por moodle_course_links y desde el 15-08 la escribe; si esto sube, hay un camino nuevo que no lo hace.',
      n: nSinCurso, esperado: 0, ejemplos: sinCurso,
    },
    {
      clave: 'intentos_duplicados',
      titulo: 'Intentos duplicados o mal numerados',
      explica: 'Dos intentos de la misma asignatura en el mismo semestre no son un recursado: son una inscripción contada dos veces. Y el número de intento de la nota tiene que ser el de su matrícula, o el acta rotula mal el recursado.',
      siSube: 'La reconstrucción abrió un intento de más, o alguien creó una matrícula que ya existía en ese periodo. De este número depende cuántos recursados dice la institución que hay.',
      n: nDupIntento, esperado: 0, ejemplos: dupIntento,
    },
    {
      clave: 'doble_calificacion',
      titulo: 'La misma asignatura con dos calificaciones en el mismo periodo',
      explica: 'Dos intentos del mismo semestre y cada uno con su nota: un cruce Moodle + SystemActiva de la migración, o dos filas de Activa entre sí. El acta no enseña nada mal —se queda con la más alta— pero el conteo de recursados los suma como si fueran cursadas distintas.',
      siSube: 'No se fusionan todavía: en 108 de ellos las dos notas caen a lados distintos del mínimo, así que elegir mal convierte un aprobado en reprobado. Se está buscando el patrón antes de tocarlos. Lo único que no puede pasar es que SUBAN — eso sería un camino nuevo creando notas duplicadas hoy.',
      n: nDobleNota, esperado: 239, ejemplos: dobleNota,
    },
    {
      clave: 'inscripciones_en_notas',
      titulo: 'Inscripciones sin calificar dentro de la tabla de notas',
      explica: 'Filas sin nota que ocupan la tabla de calificaciones. Las 4.111 de plan y las 6.584 de SystemActiva ya se movieron al registro. Desde el 15-08-2026 debe ser cero: la tabla de calificaciones guarda solo calificaciones.',
      siSube: 'Alguien volvió a crear inscripciones aquí, o entraron notas nuevas sin calificar. Lo segundo es normal si el campus abrió aulas hoy; lo primero no.',
      n: inscripciones.length, esperado: 0,
      ejemplos: [...porFuente.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} de ${k}`),
    },
  ]

  return {
    hallazgos,
    totales: {
      notas: notas.length,
      matriculas: ce.length,
      con_calificacion: notas.filter(n => (n.retake_grade ?? n.final_grade) != null).length,
      no_iniciadas: ce.filter(r => r.status === 'no_iniciada').length,
    },
  }
}
