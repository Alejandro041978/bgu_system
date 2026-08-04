-- Carga del reporte anual IAP 2025-2026 (generado desde la hoja de cálculo)

update iap_measures set
  purpose='Verificar el grado en que los estudiantes alcanzan los resultados de aprendizaje definidos para cada programa académico.', minimum_data='Resultados por SLO, número de estudiantes evaluados, número y porcentaje que alcanza el nivel esperado, curso y periodo, criterios de rúbrica y análisis del faculty.', expected_evidence='Rúbricas completadas, muestra de trabajos, matriz de resultados por SLO, informe de análisis y acta con decisiones.',
  cross_type='Transversal / evidencia académica', no_cross_note='Registrar IO-1, programa, SLO evaluado, benchmark, resultado, brecha y acción de mejora. No crear un KPI artificial.', expected_use='Revisar currículo, enseñanza, secuencia de cursos y apoyos académicos.',
  effectiveness_kpi_codes=array['E1-S01'], strategic_kpi_codes=array['E1-K4'],
  target_text='≥80% competente por cada SLO.', target_value=80, target_operator='>=',
  owner_label='Ronald',
  source_binding='rubrica',
  result_value=0, result_text='0', result_status='no_cumplido',
  result_recorded_at=now(), result_recorded_by='Reporte anual 2025-2026'
 where code='D-01';

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, 'Promedio de Evaluaciones Final de Cursos', 'Reporte anual 2025-2026' from iap_measures where code='D-01'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='Promedio de Evaluaciones Final de Cursos');

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, 'Esquema de Elaboración de Contenidos', 'Reporte anual 2025-2026' from iap_measures where code='D-01'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='Esquema de Elaboración de Contenidos');

update iap_measures set
  purpose='Determinar si los estudiantes desarrollan las competencias institucionales de educación general, como comunicación, pensamiento crítico y alfabetización cuantitativa.', minimum_data='Competencia evaluada, rúbrica utilizada, muestra, curso, periodo, puntajes por criterio, porcentaje competente y desagregaciones pertinentes.', expected_evidence='Rúbricas institucionales, trabajos estudiantiles anonimizados, informe consolidado y actas de revisión.',
  cross_type='Transversal / evidencia académica', no_cross_note='Registrar competencia, ciclo de evaluación, benchmark, resultado, hallazgos y mejora. Vincular a IO-1.', expected_use='Mejorar educación general, mapas curriculares y prácticas de evaluación.',
  effectiveness_kpi_codes=array['E1-S01'], strategic_kpi_codes=array['E1-K4'],
  target_text='≥80% competente por cada competencia de educación general.', target_value=80, target_operator='>=',
  owner_label='Ronald',
  source_binding='rubrica',
  result_value=0, result_text='0', result_status='no_cumplido',
  result_recorded_at=now(), result_recorded_by='Reporte anual 2025-2026'
 where code='D-02';

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, 'Promedio de Evaluación de Cursos de Formación General', 'Reporte anual 2025-2026' from iap_measures where code='D-02'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='Promedio de Evaluación de Cursos de Formación General');

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, 'Rubricas de Evaluacion de Trabajos Finales', 'Reporte anual 2025-2026' from iap_measures where code='D-02'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='Rubricas de Evaluacion de Trabajos Finales');

update iap_measures set
  purpose='Comprobar que el estudiante integra y aplica los conocimientos y competencias del programa al finalizar su trayectoria.', minimum_data='Estudiantes elegibles, evaluados y aprobados; puntajes de rúbrica; tipo de capstone o tesis; programa; periodo y hallazgos por criterio.', expected_evidence='Formularios de capstone, rúbricas, actas de defensa, muestras anonimizadas e informe de resultados.',
  cross_type='Indirecto / complementario', no_cross_note='Registrar que la medida demuestra logro final, no la tasa de graduación. Informar por separado aprobación del capstone y graduación.', expected_use='Ajustar currículo, requisitos finales, tutoría y preparación profesional.',
  effectiveness_kpi_codes=array['E1-I03','E5-I01'], strategic_kpi_codes=array['E1-K2','E5-K3'],
  target_text='≥80% de los estudiantes evaluados obtiene “competente” o “ejemplar” en la rúbrica final.', target_value=80, target_operator='>=',
  owner_label='Ronald',
  source_binding='externo',
  result_value=87.87, result_text='87,87%', result_status='cumplido',
  result_recorded_at=now(), result_recorded_by='Reporte anual 2025-2026'
 where code='D-03';

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, 'Consolidado de Participantes - Capstone Oficial.xlsx - Hojas de cálculo de Google.pdf', 'Reporte anual 2025-2026' from iap_measures where code='D-03'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='Consolidado de Participantes - Capstone Oficial.xlsx - Hojas de cálculo de Google.pdf');

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, 'Rubrica de evaluación', 'Reporte anual 2025-2026' from iap_measures where code='D-03'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='Rubrica de evaluación');

update iap_measures set
  purpose='Evaluar la calidad de la comunicación escrita de los estudiantes conforme a criterios institucionales.', minimum_data='Muestras anonimizadas, curso, programa, nivel, rúbrica, puntajes por criterio, porcentaje competente y comentarios de evaluadores.', expected_evidence='Muestras de escritura, rúbricas, tabla de resultados, informe y acta de revisión.',
  cross_type='Transversal / evidencia académica', no_cross_note='Registrar IO-1 y la competencia de comunicación escrita; documentar benchmark, brecha y acción.', expected_use='Fortalecer redacción, investigación, secuencia curricular y apoyo académico.',
  effectiveness_kpi_codes=array['E1-S01'], strategic_kpi_codes=array['E1-K4'],
  target_text='≥80% alcanza nivel 3 o superior en la rúbrica, o una calificación equivalente de 80/100 o más.', target_value=80, target_operator='>=',
  owner_label='Ronald',
  source_binding='externo',
  result_value=0, result_text='0', result_status='no_cumplido',
  result_recorded_at=now(), result_recorded_by='Reporte anual 2025-2026'
 where code='D-04';

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, 'Promedio de Evaluación de Trabajos Finales', 'Reporte anual 2025-2026' from iap_measures where code='D-04'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='Promedio de Evaluación de Trabajos Finales');

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, 'Rubricas de Evaluacion de Trabajos Finales', 'Reporte anual 2025-2026' from iap_measures where code='D-04'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='Rubricas de Evaluacion de Trabajos Finales');

update iap_measures set
  purpose='Determinar si el portafolio  demuestra progresión, integración y calidad del aprendizaje del estudiante.', minimum_data='Portafolios revisados, criterios, puntajes, programa, periodo, porcentaje competente y evidencia de progresión.', expected_evidence='Portafolios, rúbricas, reporte del sistema, matriz de resultados y actas.',
  cross_type='Parcial / complementario', no_cross_note='Separar el logro académico del uso de la plataforma. No usar la calidad del portafolio como sustituto de satisfacción tecnológica.', expected_use='Mejorar integración curricular, reflexión estudiantil y uso académico de la plataforma.',
  effectiveness_kpi_codes=array['E1-S01','E4-I01'], strategic_kpi_codes=array['E1-K4 E4-K4'],
  target_text='≥80% de los portafolios evaluados demuestra competencia, integración y progresión del aprendizaje.', target_value=80, target_operator='>=',
  owner_label='Ronald',
  source_binding='erp_formula',
  result_value=92.2, result_text='92,20%', result_status='cumplido',
  result_recorded_at=now(), result_recorded_by='Reporte anual 2025-2026'
 where code='D-05';

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, 'Planes Institucionales', 'Reporte anual 2025-2026' from iap_measures where code='D-05'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='Planes Institucionales');

update iap_measures set
  purpose='Evaluar la competencia de comunicación oral y defensa académica en tesis o disertaciones.', minimum_data='Número de defensas, estudiantes evaluados, puntajes por criterio, porcentaje competente, programa, evaluadores y periodo.', expected_evidence='Rúbricas de defensa, actas, grabaciones cuando proceda, informe consolidado y decisiones.',
  cross_type='Transversal / evidencia académica', no_cross_note='Registrar IO-1, competencia oral, benchmark, resultados y acciones. No confundir defensa aprobada con tasa de graduación.', expected_use='Fortalecer comunicación oral, preparación para defensa y diseño curricular.',
  effectiveness_kpi_codes=array['E1-S01','E1-I03'], strategic_kpi_codes=array['E1-K4'],
  target_text='≥80% alcanza nivel competente o superior en la rúbrica de comunicación oral y defensa académica.', target_value=80, target_operator='>=',
  owner_label='Ronald',
  source_binding='externo',
  result_value=86.35, result_text='86,35%', result_status='cumplido',
  result_recorded_at=now(), result_recorded_by='Reporte anual 2025-2026'
 where code='D-06';

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, 'Consolidado de Participantes - Capstone Oficial.xlsx - Hojas de cálculo de Google.pdf', 'Reporte anual 2025-2026' from iap_measures where code='D-06'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='Consolidado de Participantes - Capstone Oficial.xlsx - Hojas de cálculo de Google.pdf');

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, 'Reporte de Indicacores', 'Reporte anual 2025-2026' from iap_measures where code='D-06'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='Reporte de Indicacores');

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, 'Rubrica de evaluación', 'Reporte anual 2025-2026' from iap_measures where code='D-06'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='Rubrica de evaluación');

update iap_measures set
  purpose='Determinar si las actividades extracurriculares producen aprendizajes o competencias verificables.', minimum_data='Actividad, resultado de aprendizaje, participantes, instrumento, desempeño, porcentaje competente y reflexión del estudiante.', expected_evidence='Portafolios, rúbricas, productos, registros de participación, informe y actas.',
  cross_type='Condicional / múltiple', no_cross_note='Clasificar cada actividad por propósito: pertenencia, ética, internacionalización, servicio o apoyo académico; registrar solo el cruce aplicable.', expected_use='Mejorar programas cocurriculares, participación y aprendizaje fuera del aula.',
  effectiveness_kpi_codes=array['E6-I01','E6-S01','E5-S02'], strategic_kpi_codes=array['E6-K1 E6-K2  E5-K4'],
  target_text='≥80% de los participantes demuestra el resultado de aprendizaje cocurricular establecido.', target_value=80, target_operator='>=',
  owner_label='Marisol',
  source_binding='rubrica',
  result_value=0, result_text='0', result_status='no_cumplido',
  result_recorded_at=now(), result_recorded_by='Reporte anual 2025-2026'
 where code='D-07';

update iap_measures set
  purpose='Determinar si el faculty activo mantiene vigencia académica, disciplinar y profesional mediante actividades verificables realizadas durante el periodo de evaluación.', minimum_data='Publicaciones, ponencias, conferencias, grants, proyectos, fecha, autoría, afiliación, indexación o verificación y faculty activo.', expected_evidence='CV actualizados, DOI o enlaces, certificados, cartas de aceptación, repositorio e informe anual.',
  cross_type='Complementario', no_cross_note='Registrar productividad por tipo y por faculty. No usar publicaciones como sustituto de verificación de credenciales o capacitación.', expected_use='Orientar desarrollo docente, asignaciones, reconocimiento y contratación.',
  effectiveness_kpi_codes=array['E2-O02'], strategic_kpi_codes=array['E2-K2','E2-K4'],
  target_text='≥70%', target_value=70, target_operator='>=',
  owner_label='Ronald',
  source_binding='erp_formula',
  result_value=100, result_text='100%', result_status='cumplido',
  result_recorded_at=now(), result_recorded_by='Reporte anual 2025-2026'
 where code='D-08';

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, '2026', 'Reporte anual 2025-2026' from iap_measures where code='D-08'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='2026');

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, 'CV de docentes', 'Reporte anual 2025-2026' from iap_measures where code='D-08'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='CV de docentes');

update iap_measures set
  purpose='Determinar en qué medida las alianzas generan actividades', minimum_data='Proyecto, socios, participantes, horas, objetivos, productos, resultados, beneficiarios y evaluación del aprendizaje o impacto.', expected_evidence='Convenios, registros de horas, productos, rúbricas, encuestas de socios, fotografías e informe.',
  cross_type='Directo o pendiente de formalización', no_cross_note='Crear definición operativa para E6-K3: participantes únicos, horas o proyectos con impacto. Mantener separados volumen e impacto.', expected_use='Mejorar vinculación comunitaria, alianzas y asignación de recursos.',
  effectiveness_kpi_codes=array['E5-O01','E5-S01'], strategic_kpi_codes=array['E5-K1','E5-K2'],
  target_text='≥20%', target_value=20, target_operator='>=',
  owner_label='Ronald',
  source_binding='externo',
  result_value=49.08, result_text='49,08%', result_status='cumplido',
  result_recorded_at=now(), result_recorded_by='Reporte anual 2025-2026'
 where code='D-09';

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, 'RESULTADOS DE ALIANZAS', 'Reporte anual 2025-2026' from iap_measures where code='D-09'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='RESULTADOS DE ALIANZAS');

update iap_measures set
  purpose='Conocer la percepción de los graduandos sobre aprendizaje, servicios, preparación profesional y pertenencia al concluir el programa.', minimum_data='Población invitada, respuestas, tasa de respuesta, resultados por dimensión, programa, modalidad y desagregaciones.', expected_evidence='Instrumento, base anonimizada, reporte, tasa de respuesta, análisis y acciones.',
  cross_type='Múltiple / según ítems', no_cross_note='Preparar una matriz pregunta-KPI. Solo cruzar un KPI cuando la encuesta incluya la pregunta correspondiente.', expected_use='Mejorar programas, servicios, tecnología, pertenencia y transición profesional.',
  effectiveness_kpi_codes=array['E5-I01','E6-I01','E3-I01','E4-I01'], strategic_kpi_codes=array['E5-K3','E6-K1','E3-K1','E4-K4'],
  target_text='>=20%', target_value=20, target_operator='>=',
  owner_label='Marisol',
  source_binding='encuesta',
  result_value=26, result_text='26%', result_status='cumplido',
  result_recorded_at=now(), result_recorded_by='Reporte anual 2025-2026'
 where code='I-01';

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, '44 encuestados, población 172', 'Reporte anual 2025-2026' from iap_measures where code='I-01'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='44 encuestados, población 172');

update iap_measures set
  purpose='Evaluar resultados laborales, continuidad académica, relevancia de la formación y relación del egresado con BGU un año después de graduarse.', minimum_data='Situación laboral, mejora o promoción, emprendimiento, estudios posteriores, relevancia del programa, satisfacción y tasa de localización.', expected_evidence='Encuesta, base de contactos, validaciones de Career Services o LinkedIn, reporte y análisis.',
  cross_type='Directo / múltiple', no_cross_note='Definir graduados elegibles, localizados y ventana de seguimiento. Separar placement, percepción de marca y pertenencia.', expected_use='Mejorar currículo, Career Services, alumni engagement y posicionamiento.',
  effectiveness_kpi_codes=array['E5-I01','E5-I02','E6-I01'], strategic_kpi_codes=array['E5-K3','E6-K1'],
  target_text='Tasa de respuesta ≥75%', target_value=75, target_operator='>=',
  owner_label='Marisol',
  source_binding='encuesta',
  result_value=null, result_text=null, result_status='no_aplicable',
  result_recorded_at=now(), result_recorded_by='Reporte anual 2025-2026'
 where code='I-02';

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, 'No aplica (Diciembre)', 'Reporte anual 2025-2026' from iap_measures where code='I-02'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='No aplica (Diciembre)');

update iap_measures set
  purpose='Conocer la valoración de los empleadores sobre las competencias y desempeño de los graduados.', minimum_data='Empleadores invitados, respuestas, tasa de respuesta, competencias evaluadas, programa, sector y comentarios.', expected_evidence='Encuesta, directorio de empleadores, reporte, resultados por competencia y acciones.',
  cross_type='Complementario', no_cross_note='No sustituye el placement rate. Registrar percepción del empleador y usarla para validar pertinencia curricular.', expected_use='Actualizar currículo, competencias y relaciones con empleadores.',
  effectiveness_kpi_codes=array['E5-I01','E5-I02','E1-S01'], strategic_kpi_codes=array['E5-K3','E1-K4'],
  target_text='≥65%', target_value=65, target_operator='>=',
  owner_label='Marisol',
  source_binding='encuesta',
  result_value=0, result_text='0', result_status='no_cumplido',
  result_recorded_at=now(), result_recorded_by='Reporte anual 2025-2026'
 where code='I-03';

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, 'Se espera que finalice la encuesta de graduados, no se aplico en Marzo', 'Reporte anual 2025-2026' from iap_measures where code='I-03'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='Se espera que finalice la encuesta de graduados, no se aplico en Marzo');

update iap_measures set
  purpose='Medir la satisfacción y experiencia general de los estudiantes con docencia, servicios, tecnología, apoyo y pertenencia.', minimum_data='Población, respuestas, tasa de respuesta, resultados por dimensión, programa, modalidad, nivel y grupos relevantes.', expected_evidence='Instrumento, base anonimizada, reporte, análisis desagregado y acciones.',
  cross_type='Múltiple / según ítems', no_cross_note='Crear matriz pregunta-KPI. No usar resultados estudiantiles para medir satisfacción del staff.', expected_use='Mejorar experiencia estudiantil, servicios, LMS, pertenencia y apoyo económico.',
  effectiveness_kpi_codes=array['E3-I01','E4-I01','E6-I01','E7-S01','E5-I02'], strategic_kpi_codes=array['E3-K1 : E4-K4','E6-K1'],
  target_text='≥75% satisfacción de las tres preguntas obligatorias', target_value=75, target_operator='>=',
  owner_label='Marisol',
  source_binding='encuesta',
  result_value=92, result_text='92%', result_status='cumplido',
  result_recorded_at=now(), result_recorded_by='Reporte anual 2025-2026'
 where code='I-04';

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, 'Base Encuesta', 'Reporte anual 2025-2026' from iap_measures where code='I-04'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='Base Encuesta');

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, '(8) ¿Qué tan satisfecho/a está con la atención y respuesta del área de soporte o servicios estudiantiles?', 'Reporte anual 2025-2026' from iap_measures where code='I-04'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='(8) ¿Qué tan satisfecho/a está con la atención y respuesta del área de soporte o servicios estudiantiles?');

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, '112 Encuestados al 14-07', 'Reporte anual 2025-2026' from iap_measures where code='I-04'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='112 Encuestados al 14-07');

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, 'neutral        19', 'Reporte anual 2025-2026' from iap_measures where code='I-04'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='neutral        19');

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, 'satisfecho        38', 'Reporte anual 2025-2026' from iap_measures where code='I-04'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='satisfecho        38');

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, 'muy satisfecho        46', 'Reporte anual 2025-2026' from iap_measures where code='I-04'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='muy satisfecho        46');

update iap_measures set
  purpose='Conocer la percepción del personal sobre liderazgo, colaboración, recursos, desarrollo, clima y pertenencia.', minimum_data='Personal elegible, respuestas, tasa de respuesta, dimensiones, unidad, antigüedad y resultados desagregados sin comprometer confidencialidad.', expected_evidence='Instrumento, base anonimizada, reporte, análisis y plan de acción.',
  cross_type='Directo / múltiple', no_cross_note='Separar clima laboral, pertenencia y permanencia. La encuesta no sustituye la tasa de retención del staff.', expected_use='Mejorar clima, liderazgo, recursos, desarrollo y retención del personal.',
  effectiveness_kpi_codes=array['E3-I02','E6-I01E3-S01'], strategic_kpi_codes=array['E3-K1','E6-K1'],
  target_text='≥65%', target_value=65, target_operator='>=',
  owner_label='Yajayra',
  source_binding='encuesta',
  result_value=96.69, result_text='96,69%', result_status='cumplido',
  result_recorded_at=now(), result_recorded_by='Reporte anual 2025-2026'
 where code='I-05';

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, '96,69% Informe: Informe del Indicador 3.4 - Clima Laboral Administrativo - Plan de Efectividad 2025-2026 Anual2025 (1).pdf', 'Reporte anual 2025-2026' from iap_measures where code='I-05'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='96,69% Informe: Informe del Indicador 3.4 - Clima Laboral Administrativo - Plan de Efectividad 2025-2026 Anual2025 (1).pdf');

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, '"Indice de Satisfaccion (%)=Número total de respuestas/Número de respuestas con valores 3, 4 y 5​×100"', 'Reporte anual 2025-2026' from iap_measures where code='I-05'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='"Indice de Satisfaccion (%)=Número total de respuestas/Número de respuestas con valores 3, 4 y 5​×100"');

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, 'Encuesta: ENCUESTA DEL CLIMA LABORAL STAFF - BGU.pdf', 'Reporte anual 2025-2026' from iap_measures where code='I-05'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='Encuesta: ENCUESTA DEL CLIMA LABORAL STAFF - BGU.pdf');

update iap_measures set
  purpose='Evaluar la experiencia del estudiante en cada curso y el desempeño docente, materiales, comunicación y uso del LMS.', minimum_data='Curso, docente, periodo, respuestas, tasa de respuesta, puntuaciones por dimensión y comentarios depurados.', expected_evidence='Instrumento, reporte por curso y docente, consolidado institucional, análisis y acciones.',
  cross_type='Directo / múltiple', no_cross_note='Distinguir ítems de docencia e ítems tecnológicos. Reportar cada KPI con sus preguntas específicas.', expected_use='Mejorar docencia, diseño de cursos, materiales, comunicación y LMS.',
  effectiveness_kpi_codes=array['E2-I01','E4-I01'], strategic_kpi_codes=array['E2-K1','E4-K4'],
  target_text='≥4/5', target_value=4, target_operator='>=',
  owner_label='Ronald',
  source_binding='encuesta',
  result_value=4.54, result_text='4,54', result_status='cumplido',
  result_recorded_at=now(), result_recorded_by='Reporte anual 2025-2026'
 where code='I-06';

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, 'Indicadores de Programas de Estudio BGU 2025–2026.pdf', 'Reporte anual 2025-2026' from iap_measures where code='I-06'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='Indicadores de Programas de Estudio BGU 2025–2026.pdf');

update iap_measures set
  purpose='Medir continuidad, retención y finalización de los estudiantes por cohorte y subgrupos.', minimum_data='Cohorte, elegibles, continuantes, completados, retirados, periodo, programa, nivel, modalidad y desagregaciones.', expected_evidence='Extracción SIS, diccionario de datos, cálculos, dashboard, validación y análisis.',
  cross_type='Directo / múltiple', no_cross_note='Separar retención, completion y persistencia de beneficiarios. Documentar denominadores y cohortes.', expected_use='Diseñar intervenciones de retención, apoyo y revisión de programas.',
  effectiveness_kpi_codes=array['E1-I02','E1-I03','E7-I01'], strategic_kpi_codes=array['E1-K3','E7-K3'],
  target_text='≥85%', target_value=85, target_operator='>=',
  owner_label='Marisol',
  source_binding='erp_formula',
  result_value=91, result_text='91%', result_status='cumplido',
  result_recorded_at=now(), result_recorded_by='Reporte anual 2025-2026'
 where code='I-07';

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, 'Ratios 801 Data Collection (18.11.25) .xlsx', 'Reporte anual 2025-2026' from iap_measures where code='I-07'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='Ratios 801 Data Collection (18.11.25) .xlsx');

update iap_measures set
  purpose='Determinar la proporción de estudiantes de una cohorte que se gradúa dentro de la ventana institucional definida.', minimum_data='Cohorte ajustada, graduados, exclusiones permitidas, ventana, programa, nivel y desagregaciones.', expected_evidence='Datos SIS, metodología, tabla de cohortes, cálculos, validación y tendencias.',
  cross_type='Directo', no_cross_note='Registrar IO-1 y el KPI E1-I03. No forzar cruce con países representados.', expected_use='Mejorar progresión, currículo, asesoría y apoyo al estudiante.',
  effectiveness_kpi_codes=array['E1-I03'], strategic_kpi_codes=array['E1-K2'],
  target_text='>=70%', target_value=70, target_operator='>=',
  owner_label='Marisol',
  source_binding='erp_formula',
  result_value=56, result_text='56%', result_status='parcial',
  result_recorded_at=now(), result_recorded_by='Reporte anual 2025-2026'
 where code='I-08';

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, 'Ratios 801 Data Collection (18.11.25) .xlsx Bachelor: 59%               Master: 54%                       Doctoral: 0%', 'Reporte anual 2025-2026' from iap_measures where code='I-08'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='Ratios 801 Data Collection (18.11.25) .xlsx Bachelor: 59%               Master: 54%                       Doctoral: 0%');

update iap_measures set
  purpose='Evaluar la capacidad financiera de la institución para sostener operaciones, obligaciones y objetivos estratégicos.', minimum_data='Estados auditados, razones financieras, liquidez, reservas, ingresos, gastos, obligaciones y metodología de puntuación.', expected_evidence='Estados financieros auditados, cálculos, informe financiero, actas y planes de mitigación.',
  cross_type='Transversal / sostenibilidad', no_cross_note='Registrar como indicador institucional de sostenibilidad financiera. Recomendar crear KPI financiero específico si se desea monitoreo estratégico.', expected_use='Respaldar presupuesto, continuidad operativa, gestión de riesgos y asignación de recursos.',
  effectiveness_kpi_codes=array['E7-O01'], strategic_kpi_codes=array['E7-K1','E7-K4'],
  target_text='100% de los estados financieros auditados', target_value=100, target_operator='>=',
  owner_label='Yajayra',
  source_binding='externo',
  result_value=100, result_text='100%', result_status='cumplido',
  result_recorded_at=now(), result_recorded_by='Reporte anual 2025-2026'
 where code='I-09';

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, '100% Estados Financieros Auditados: Audit opinion Global Education LLC Dec 2025 - Firmado.pdf', 'Reporte anual 2025-2026' from iap_measures where code='I-09'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='100% Estados Financieros Auditados: Audit opinion Global Education LLC Dec 2025 - Firmado.pdf');

update iap_measures set
  purpose='Consolidar y monitorear el desempeño de todos los KPI del Plan Estratégico y del Plan de Efectividad.', minimum_data='Meta, resultado, fórmula, fuente, responsable, evidencia, brecha, estado, decisión, tendencia y avance de acciones.', expected_evidence='Dashboard integrado, fichas técnicas, evidencias vinculadas, minutas de revisión y planes de mejora.',
  cross_type='Cruce maestro', no_cross_note='Usar una matriz única de trazabilidad y conservar definiciones, fórmulas y metas consistentes entre planes.', expected_use='Gobernanza, seguimiento, decisiones, recursos y cierre del ciclo de mejora.',
  effectiveness_kpi_codes=array['E1 a E7'], strategic_kpi_codes=array['E1-K1 a E7-K4'],
  target_text='100% de los KPI actualizados', target_value=100, target_operator='>=',
  owner_label='Maria',
  source_binding='erp_formula',
  result_value=100, result_text='100%', result_status='cumplido',
  result_recorded_at=now(), result_recorded_by='Reporte anual 2025-2026'
 where code='I-10';

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, 'Dashboard de Planeamiento Institucional', 'Reporte anual 2025-2026' from iap_measures where code='I-10'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='Dashboard de Planeamiento Institucional');

update iap_measures set
  purpose='Determinar si las necesidades identificadas en las evaluaciones de desempeño se convierten en acciones concretas de capacitación y desarrollo.', minimum_data='Personal que cumplió con las capacitaciones', expected_evidence='Asistencia en formularios',
  cross_type='Complementario / condicionado', no_cross_note='Separar faculty y staff. La evaluación de desempeño no sustituye capacitación ni permanencia; debe alimentar sus planes.', expected_use='Definir capacitación, reconocimiento, sucesión, contratación y mejora del desempeño.',
  effectiveness_kpi_codes=array['E3-S02'], strategic_kpi_codes=array['E3-K2'],
  target_text='≥ 85%', target_value=85, target_operator='>=',
  owner_label='Yajayra',
  source_binding='externo',
  result_value=93, result_text='93%', result_status='cumplido',
  result_recorded_at=now(), result_recorded_by='Reporte anual 2025-2026'
 where code='I-11';

insert into iap_measure_evidence (measure_id, label, uploaded_by)
  select id, '93,33%  Informe con corte a Junio 2026: Informe del Indicado 3.6 - Capacitación Administrativa', 'Reporte anual 2025-2026' from iap_measures where code='I-11'
   and not exists (select 1 from iap_measure_evidence x where x.measure_id=iap_measures.id and x.label='93,33%  Informe con corte a Junio 2026: Informe del Indicado 3.6 - Capacitación Administrativa');


update iap_measures m set owner_employee_id = e.id
  from hr_employees e
 where m.owner_employee_id is null and m.owner_label is not null
   and e.full_name ilike '%' || m.owner_label || '%';
