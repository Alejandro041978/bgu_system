-- Reporte del Plan de Efectividad 2025-2026 (generado desde la hoja)



update effectiveness_kpis set
  measure_type='cuantitativa_directa', data_source='Plan académico anual; catalogo; registro de programas', frequency='anual', level='institucional'
 where trim(code)='E1-I01';

update effectiveness_kpis set
  measure_type='cuantitativa_directa', data_source='SIS/SMS; registros del Registrar', frequency='anual', level='institucional'
 where trim(code)='E1-I02';

update effectiveness_kpis set
  measure_type='cuantitativa_directa', data_source='Registros academicos; expedientes de graduación', frequency='anual', level='institucional'
 where trim(code)='E1-I03';

update effectiveness_kpis set
  measure_type='mixta', data_source='Informes de revisión curricular; actas de advisory councils', frequency='anual', level='estrategico'
 where trim(code)='E1-S01';

update effectiveness_kpis set
  measure_type='cuantitativa_directa', data_source='Registro de admision; SIS/SMS', frequency='anual', level='estrategico'
 where trim(code)='E1-S02';

update effectiveness_kpis set
  measure_type='cuantitativa_directa', data_source='Registro público CIE; resoluciones y expedientes', frequency='anual', level='operativo'
 where trim(code)='E1-O01';

update effectiveness_kpis set
  measure_type='cuantitativa_indirecta', data_source='Encuestas finales de curso', frequency='anual', level='institucional'
 where trim(code)='E2-I01';

update effectiveness_kpis set
  measure_type='cuantitativa_directa', data_source='Registros de capacitación', frequency='anual', level='estrategico'
 where trim(code)='E2-S01';

update effectiveness_kpis set
  measure_type='cuantitativa_directa', data_source='Roster docente; contratos; nómina', frequency='anual', level='estrategico'
 where trim(code)='E2-S02';

update effectiveness_kpis set
  measure_type='cuantitativa_directa', data_source='Roster y expedientes de faculty', frequency='anual', level='operativo'
 where trim(code)='E2-O01';

update effectiveness_kpis set
  measure_type='cuantitativa_directa', data_source='Expedientes y asignaciones docentes', frequency='anual', level='operativo'
 where trim(code)='E2-O02';

update effectiveness_kpis set
  measure_type='cuantitativa_indirecta', data_source='Encuesta anual de satisfaccion; reporte de servicio', frequency='anual', level='institucional'
 where trim(code)='E3-I01';

update effectiveness_kpis set
  measure_type='cuantitativa_indirecta', data_source='Encuesta anual al staff', frequency='anual', level='institucional'
 where trim(code)='E3-I02';

update effectiveness_kpis set
  measure_type='cuantitativa_directa', data_source='Nómina y registros de recursos humanos', frequency='anual', level='estrategico'
 where trim(code)='E3-S01';

update effectiveness_kpis set
  measure_type='cuantitativa_directa', data_source='Registros de capacitación y certificados', frequency='anual', level='estrategico'
 where trim(code)='E3-S02';

update effectiveness_kpis set
  measure_type='cuantitativa_directa', data_source='Zoho Desk, Bitrix u otro sistema de tickets', frequency='anual', level='operativo'
 where trim(code)='E3-O01';

update effectiveness_kpis set
  measure_type='cuantitativa_directa', data_source='Sistema de tickets y reportes de SLA', frequency='anual', level='operativo'
 where trim(code)='E3-O02';

update effectiveness_kpis set
  measure_type='cuantitativa_indirecta', data_source='Encuestas institucionales', frequency='anual', level='institucional'
 where trim(code)='E4-I01';

update effectiveness_kpis set
  measure_type='cuantitativa_directa', data_source='Logs y reportes de infraestructura', frequency='anual', level='estrategico'
 where trim(code)='E4-S01';

update effectiveness_kpis set
  measure_type='cuantitativa_indirecta', data_source='Encuesta anual de tecnologia y privacidad', frequency='anual', level='estrategico'
 where trim(code)='E4-S02';

update effectiveness_kpis set
  measure_type='cuantitativa_directa', data_source='Registro de procesos; actas de aceptacion', frequency='anual', level='operativo'
 where trim(code)='E4-O01';

update effectiveness_kpis set
  measure_type='cuantitativa_directa', data_source='LMS de capacitación; certificados', frequency='anual', level='operativo'
 where trim(code)='E4-O02';

update effectiveness_kpis set
  measure_type='mixta', data_source='Encuesta de egresados; verificacion de Career Service', frequency='anual', level='institucional'
 where trim(code)='E5-I01';

update effectiveness_kpis set
  measure_type='cuantitativa_indirecta', data_source='Encuestas a estudiantes, alumni y aliados', frequency='anual', level='institucional'
 where trim(code)='E5-I02';

update effectiveness_kpis set
  measure_type='mixta', data_source='Informe anual de convenios y evidencias de actividad', frequency='anual', level='estrategico'
 where trim(code)='E5-S01';

update effectiveness_kpis set
  measure_type='cuantitativa_directa', data_source='Registro de movilidad y actividades internacionales', frequency='anual', level='estrategico'
 where trim(code)='E5-S02';

update effectiveness_kpis set
  measure_type='cuantitativa_directa', data_source='Registro de convenios; actas; productos y reportes', frequency='anual', level='operativo'
 where trim(code)='E5-O01';

update effectiveness_kpis set
  measure_type='cuantitativa_indirecta', data_source='Encuesta institucional de cultura y pertenencia', frequency='anual', level='institucional'
 where trim(code)='E6-I01';

update effectiveness_kpis set
  measure_type='mixta', data_source='Rubricas, encuestas y evidencias de actividades formativas', frequency='anual', level='estrategico'
 where trim(code)='E6-S01';

update effectiveness_kpis set
  measure_type='cuantitativa_directa', data_source='Registros de capacitación y certificados', frequency='anual', level='operativo'
 where trim(code)='E6-O01';

update effectiveness_kpis set
  measure_type='cuantitativa_directa', data_source='SIS/SMS; registro de beneficiarios', frequency='anual', level='institucional'
 where trim(code)='E7-I01';

update effectiveness_kpis set
  measure_type='cuantitativa_indirecta', data_source='Encuesta a beneficiarios y solicitantes', frequency='anual', level='estrategico'
 where trim(code)='E7-S01';

update effectiveness_kpis set
  measure_type='cuantitativa_directa', data_source='Registros financieros y de ayuda estudiantil', frequency='anual', level='operativo'
 where trim(code)='E7-O01';

update effectiveness_kpis set
  measure_type='cuantitativa_directa', data_source='Contabilidad; contratos y recibos de donacion', frequency='anual', level='operativo'
 where trim(code)='E7-O0';

update effectiveness_plan_kpis pk set
  responsible_unit='Division of Academic Affairs / Division of Admissions and Marketing', estado='cumplido',
  resultado=100, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E1-I01';

insert into effectiveness_evidence (plan_kpi_id, label, pending, uploaded_by)
 select pk.id, 'Catálogo BGU 12499Approved Data (1).pdf', true, 'Reporte 2025-2026'
   from effectiveness_plan_kpis pk join effectiveness_kpis k on k.id=pk.kpi_id
  where trim(k.code)='E1-I01'
    and not exists (select 1 from effectiveness_evidence x where x.plan_kpi_id=pk.id);

update effectiveness_plan_kpis pk set
  responsible_unit='Registrar / Division of Student Services', estado='cumplido',
  resultado=91, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E1-I02';

insert into effectiveness_evidence (plan_kpi_id, label, pending, uploaded_by)
 select pk.id, 'Ratios 801 Data Collection (18.11.25) .xlsx', true, 'Reporte 2025-2026'
   from effectiveness_plan_kpis pk join effectiveness_kpis k on k.id=pk.kpi_id
  where trim(k.code)='E1-I02'
    and not exists (select 1 from effectiveness_evidence x where x.plan_kpi_id=pk.id);

update effectiveness_plan_kpis pk set
  responsible_unit='Registrar / Division of Student Services', estado='parcial',
  resultado=56, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E1-I03';

insert into effectiveness_evidence (plan_kpi_id, label, pending, uploaded_by)
 select pk.id, 'Copia de RATIOS DEAC - 24-03-26 Ratios 801 Data Collection (18.11.25) .xlsx', true, 'Reporte 2025-2026'
   from effectiveness_plan_kpis pk join effectiveness_kpis k on k.id=pk.kpi_id
  where trim(k.code)='E1-I03'
    and not exists (select 1 from effectiveness_evidence x where x.plan_kpi_id=pk.id);

update effectiveness_plan_kpis pk set
  responsible_unit='Division of Academic Affairs', estado='cumplido',
  resultado=461, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E1-S01';

insert into effectiveness_evidence (plan_kpi_id, label, pending, uploaded_by)
 select pk.id, 'INFORME DE REVISIÓN CURRICULAR DEL PROGRAMA DE.docx', true, 'Reporte 2025-2026'
   from effectiveness_plan_kpis pk join effectiveness_kpis k on k.id=pk.kpi_id
  where trim(k.code)='E1-S01'
    and not exists (select 1 from effectiveness_evidence x where x.plan_kpi_id=pk.id);

update effectiveness_plan_kpis pk set
  responsible_unit='Division of Admissions and Marketing / Registrar', estado='cumplido',
  resultado=21, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E1-S02';

insert into effectiveness_evidence (plan_kpi_id, label, pending, uploaded_by)
 select pk.id, 'Paises/Registros', true, 'Reporte 2025-2026'
   from effectiveness_plan_kpis pk join effectiveness_kpis k on k.id=pk.kpi_id
  where trim(k.code)='E1-S02'
    and not exists (select 1 from effectiveness_evidence x where x.plan_kpi_id=pk.id);

update effectiveness_plan_kpis pk set
  responsible_unit='Division of Academic Affairs', estado='cumplido',
  resultado=11, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E1-O01';

insert into effectiveness_evidence (plan_kpi_id, label, pending, uploaded_by)
 select pk.id, '12499Approved Data (1).pdf', true, 'Reporte 2025-2026'
   from effectiveness_plan_kpis pk join effectiveness_kpis k on k.id=pk.kpi_id
  where trim(k.code)='E1-O01'
    and not exists (select 1 from effectiveness_evidence x where x.plan_kpi_id=pk.id);

update effectiveness_plan_kpis pk set
  responsible_unit='Division of Academic Affairs / Division of Student Services', estado='cumplido',
  resultado=454, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E2-I01';

insert into effectiveness_evidence (plan_kpi_id, label, pending, uploaded_by)
 select pk.id, 'Indicadores de Programas de Estudio BGU 2025–2026.pdf', true, 'Reporte 2025-2026'
   from effectiveness_plan_kpis pk join effectiveness_kpis k on k.id=pk.kpi_id
  where trim(k.code)='E2-I01'
    and not exists (select 1 from effectiveness_evidence x where x.plan_kpi_id=pk.id);

update effectiveness_plan_kpis pk set
  responsible_unit='Division of Continuing Education / Division of Academic Affairs', estado='cumplido',
  resultado=100, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E2-S01';

insert into effectiveness_evidence (plan_kpi_id, label, pending, uploaded_by)
 select pk.id, 'Registros de capacitación PLAN ANUAL DE DESARROLLO DOCENTE 2025 - 2026 INFORME DE CUMPLIMIENTO DEL PLAN ANUAL DE DESARROLLO DOCENTE 2025 - 2026', true, 'Reporte 2025-2026'
   from effectiveness_plan_kpis pk join effectiveness_kpis k on k.id=pk.kpi_id
  where trim(k.code)='E2-S01'
    and not exists (select 1 from effectiveness_evidence x where x.plan_kpi_id=pk.id);

update effectiveness_plan_kpis pk set
  responsible_unit='Division of Academic Affairs / Administration Services and Finance', estado='cumplido',
  resultado=93, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E2-S02';

insert into effectiveness_evidence (plan_kpi_id, label, pending, uploaded_by)
 select pk.id, 'Permanencia docente: 2025-2026 45 docentes y del 2026- 2027 tenemos 68 de ellos 42 de los 45 continuan', true, 'Reporte 2025-2026'
   from effectiveness_plan_kpis pk join effectiveness_kpis k on k.id=pk.kpi_id
  where trim(k.code)='E2-S02'
    and not exists (select 1 from effectiveness_evidence x where x.plan_kpi_id=pk.id);

update effectiveness_plan_kpis pk set
  responsible_unit='Division of Academic Affairs', estado='cumplido',
  resultado=null, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E2-O01';

insert into effectiveness_evidence (plan_kpi_id, label, pending, uploaded_by)
 select pk.id, 'Diversidad internacional del claustro', true, 'Reporte 2025-2026'
   from effectiveness_plan_kpis pk join effectiveness_kpis k on k.id=pk.kpi_id
  where trim(k.code)='E2-O01'
    and not exists (select 1 from effectiveness_evidence x where x.plan_kpi_id=pk.id);

update effectiveness_plan_kpis pk set
  responsible_unit='Division of Academic Affairs', estado='cumplido',
  resultado=41, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E2-O02';

insert into effectiveness_evidence (plan_kpi_id, label, pending, uploaded_by)
 select pk.id, 'Profesores Top en actividad 28 de 68 docentes', true, 'Reporte 2025-2026'
   from effectiveness_plan_kpis pk join effectiveness_kpis k on k.id=pk.kpi_id
  where trim(k.code)='E2-O02'
    and not exists (select 1 from effectiveness_evidence x where x.plan_kpi_id=pk.id);

update effectiveness_plan_kpis pk set
  responsible_unit='Division of Administration Services and Finance / Division of Student Services', estado='cumplido',
  resultado=92, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E3-I01';

insert into effectiveness_evidence (plan_kpi_id, label, pending, uploaded_by)
 select pk.id, 'Base Encuesta (8) ¿Qué tan satisfecho/a está con la atención y respuesta del área de soporte o servicios estudiantiles? 112 Encuestados al 14-07 neutral 19 satisfecho 38 muy satisfecho 46', true, 'Reporte 2025-2026'
   from effectiveness_plan_kpis pk join effectiveness_kpis k on k.id=pk.kpi_id
  where trim(k.code)='E3-I01'
    and not exists (select 1 from effectiveness_evidence x where x.plan_kpi_id=pk.id);

update effectiveness_plan_kpis pk set
  responsible_unit='Division of Administration Services and Finance', estado='cumplido',
  resultado=96.69, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E3-I02';

insert into effectiveness_evidence (plan_kpi_id, label, pending, uploaded_by)
 select pk.id, 'Informe: Informe del Indicador 3.4 - Clima Laboral Administrativo - Plan de Efectividad 2025-2026 Anual2025 (1).pdf Indice de Satisfaccion (%)=Número total de respuestas/Número de respuestas con valores 3, 4 y 5​×100 Encuesta: ENCUESTA DEL CLIMA LABORAL STAFF - BGU.pdf', true, 'Reporte 2025-2026'
   from effectiveness_plan_kpis pk join effectiveness_kpis k on k.id=pk.kpi_id
  where trim(k.code)='E3-I02'
    and not exists (select 1 from effectiveness_evidence x where x.plan_kpi_id=pk.id);

update effectiveness_plan_kpis pk set
  responsible_unit='Division of Administration Services and Finance', estado='parcial',
  resultado=77, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E3-S01';

insert into effectiveness_evidence (plan_kpi_id, label, pending, uploaded_by)
 select pk.id, 'Permanencia del Personal Administrativo: Cuadro de asignación de personal y Job Description BGU', true, 'Reporte 2025-2026'
   from effectiveness_plan_kpis pk join effectiveness_kpis k on k.id=pk.kpi_id
  where trim(k.code)='E3-S01'
    and not exists (select 1 from effectiveness_evidence x where x.plan_kpi_id=pk.id);

update effectiveness_plan_kpis pk set
  responsible_unit='Division of Administration Services and Finance', estado='cumplido',
  resultado=93, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E3-S02';

insert into effectiveness_evidence (plan_kpi_id, label, pending, uploaded_by)
 select pk.id, 'Informe con corte a Junio 2026 - 93,33%: Informe del Indicado 3.6 - Capacitación Administrativa', true, 'Reporte 2025-2026'
   from effectiveness_plan_kpis pk join effectiveness_kpis k on k.id=pk.kpi_id
  where trim(k.code)='E3-S02'
    and not exists (select 1 from effectiveness_evidence x where x.plan_kpi_id=pk.id);

update effectiveness_plan_kpis pk set
  responsible_unit='Division of Student Services', estado='no_cumplido',
  resultado=0, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E3-O01';

update effectiveness_plan_kpis pk set
  responsible_unit='Division of Student Services', estado='no_cumplido',
  resultado=0, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E3-O02';

update effectiveness_plan_kpis pk set
  responsible_unit='Division of Student Services / Division of Academic Affairs', estado='no_cumplido',
  resultado=3.97, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E4-I01';

insert into effectiveness_evidence (plan_kpi_id, label, pending, uploaded_by)
 select pk.id, 'https://support.blackwell.university/tech-infrastructure-reports/', true, 'Reporte 2025-2026'
   from effectiveness_plan_kpis pk join effectiveness_kpis k on k.id=pk.kpi_id
  where trim(k.code)='E4-I01'
    and not exists (select 1 from effectiveness_evidence x where x.plan_kpi_id=pk.id);

update effectiveness_plan_kpis pk set
  responsible_unit='Administration Services and Finance / Technology', estado='cumplido',
  resultado=null, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E4-S01';

insert into effectiveness_evidence (plan_kpi_id, label, pending, uploaded_by)
 select pk.id, 'https://support.blackwell.university/Uptime', true, 'Reporte 2025-2026'
   from effectiveness_plan_kpis pk join effectiveness_kpis k on k.id=pk.kpi_id
  where trim(k.code)='E4-S01'
    and not exists (select 1 from effectiveness_evidence x where x.plan_kpi_id=pk.id);

update effectiveness_plan_kpis pk set
  responsible_unit='Division of Student Services / Division of Academic Affairs', estado='no_cumplido',
  resultado=0, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E4-S02';

insert into effectiveness_evidence (plan_kpi_id, label, pending, uploaded_by)
 select pk.id, 'No disponemos de la encuesta. Propuesta: https://support.blackwell.university/it-security/ Políticas de protección de datos y seguridad https://docs.google.com/document/d/1aBR7ldYpulRs7XhVqGswRm3MEF1tLrntJ-Oad22f0jQ/edit?tab=t.0 https://docs.google.com/document/d/1RFrZQHdt4AwnFpWNjISEgZEEMaypGjVfMpq', true, 'Reporte 2025-2026'
   from effectiveness_plan_kpis pk join effectiveness_kpis k on k.id=pk.kpi_id
  where trim(k.code)='E4-S02'
    and not exists (select 1 from effectiveness_evidence x where x.plan_kpi_id=pk.id);

update effectiveness_plan_kpis pk set
  responsible_unit='Administration Services and Finance / Technology', estado='cumplido',
  resultado=15, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E4-O01';

insert into effectiveness_evidence (plan_kpi_id, label, pending, uploaded_by)
 select pk.id, 'Formularios Admision Acreditación Proyecto Capstone Chatfuel Master / doctorado / Licenciatura Chatfuel DCE ORA IA BGU Trabajos finales Sesiones Eurocoach Sesiones Mentoring Activa Student / Admin Reporte de Consolidado de Deudas y Recaudación de la Empresa por fechas. Sincronización de alumnos y su', true, 'Reporte 2025-2026'
   from effectiveness_plan_kpis pk join effectiveness_kpis k on k.id=pk.kpi_id
  where trim(k.code)='E4-O01'
    and not exists (select 1 from effectiveness_evidence x where x.plan_kpi_id=pk.id);

update effectiveness_plan_kpis pk set
  responsible_unit='Division of Academic Affairs / Division of Continuing Education', estado='no_cumplido',
  resultado=0, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E4-O02';

insert into effectiveness_evidence (plan_kpi_id, label, pending, uploaded_by)
 select pk.id, '0% NUEVO KPI - Por implementar Se gestionará cronograma para la capacitación', true, 'Reporte 2025-2026'
   from effectiveness_plan_kpis pk join effectiveness_kpis k on k.id=pk.kpi_id
  where trim(k.code)='E4-O02'
    and not exists (select 1 from effectiveness_evidence x where x.plan_kpi_id=pk.id);

update effectiveness_plan_kpis pk set
  responsible_unit='Division of Student Services', estado='parcial',
  resultado=27, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E5-I01';

insert into effectiveness_evidence (plan_kpi_id, label, pending, uploaded_by)
 select pk.id, 'Ratios 801 Data Collection (18.11.25) .xlsx Fueron 46 respuestas Población 172', true, 'Reporte 2025-2026'
   from effectiveness_plan_kpis pk join effectiveness_kpis k on k.id=pk.kpi_id
  where trim(k.code)='E5-I01'
    and not exists (select 1 from effectiveness_evidence x where x.plan_kpi_id=pk.id);

update effectiveness_plan_kpis pk set
  responsible_unit='Division of Admissions and Marketing', estado='no_cumplido',
  resultado=0, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E5-I02';

insert into effectiveness_evidence (plan_kpi_id, label, pending, uploaded_by)
 select pk.id, 'El indicador E5-I02 (Percepción de marca global) no ha sido ejecutado a la fecha debido a que aún no se cuenta con el instrumento de medición (encuesta de percepción de marca) diseñado y aplicado a los grupos de interés. En las encuestas aplicadas hasta el momento por las áreas de Registros (Encuest', true, 'Reporte 2025-2026'
   from effectiveness_plan_kpis pk join effectiveness_kpis k on k.id=pk.kpi_id
  where trim(k.code)='E5-I02'
    and not exists (select 1 from effectiveness_evidence x where x.plan_kpi_id=pk.id);

update effectiveness_plan_kpis pk set
  responsible_unit='Division of Admissions and Marketing / Division of Academic Affairs', estado='cumplido',
  resultado=4, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E5-S01';

insert into effectiveness_evidence (plan_kpi_id, label, pending, uploaded_by)
 select pk.id, 'RELEVANCIA DE ALIANZAS - RÚBRICA', true, 'Reporte 2025-2026'
   from effectiveness_plan_kpis pk join effectiveness_kpis k on k.id=pk.kpi_id
  where trim(k.code)='E5-S01'
    and not exists (select 1 from effectiveness_evidence x where x.plan_kpi_id=pk.id);

update effectiveness_plan_kpis pk set
  responsible_unit='Division of Student Services / Division of Academic Affairs', estado='parcial',
  resultado=3, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E5-S02';

insert into effectiveness_evidence (plan_kpi_id, label, pending, uploaded_by)
 select pk.id, 'Meet and Greet, Congresos, American experience -New Business Leaders for a New World: 3', true, 'Reporte 2025-2026'
   from effectiveness_plan_kpis pk join effectiveness_kpis k on k.id=pk.kpi_id
  where trim(k.code)='E5-S02'
    and not exists (select 1 from effectiveness_evidence x where x.plan_kpi_id=pk.id);

update effectiveness_plan_kpis pk set
  responsible_unit='Division of Admissions and Marketing', estado='parcial',
  resultado=15, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E5-O01';

insert into effectiveness_evidence (plan_kpi_id, label, pending, uploaded_by)
 select pk.id, 'CONVENIOS ACTIVOS VERIFICADOS', true, 'Reporte 2025-2026'
   from effectiveness_plan_kpis pk join effectiveness_kpis k on k.id=pk.kpi_id
  where trim(k.code)='E5-O01'
    and not exists (select 1 from effectiveness_evidence x where x.plan_kpi_id=pk.id);

update effectiveness_plan_kpis pk set
  responsible_unit='President / Division of Student Services', estado='no_cumplido',
  resultado=0, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E6-I01';

insert into effectiveness_evidence (plan_kpi_id, label, pending, uploaded_by)
 select pk.id, 'Se recomienda incluir: ¿Qué tan identificado/a se siente con los valores y la comunidad de Blackwell Global University?', true, 'Reporte 2025-2026'
   from effectiveness_plan_kpis pk join effectiveness_kpis k on k.id=pk.kpi_id
  where trim(k.code)='E6-I01'
    and not exists (select 1 from effectiveness_evidence x where x.plan_kpi_id=pk.id);

update effectiveness_plan_kpis pk set
  responsible_unit='Division of Academic Affairs / Compliance', estado='no_cumplido',
  resultado=0, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E6-S01';

insert into effectiveness_evidence (plan_kpi_id, label, pending, uploaded_by)
 select pk.id, '(11) ¿Qué sugerencia tendría para mejorar o fortalecer la misión, visión, valores u objetivos institucionales? Menciona los valores, pero es una pregunta abierta y no permite calcular el IVET.', true, 'Reporte 2025-2026'
   from effectiveness_plan_kpis pk join effectiveness_kpis k on k.id=pk.kpi_id
  where trim(k.code)='E6-S01'
    and not exists (select 1 from effectiveness_evidence x where x.plan_kpi_id=pk.id);

update effectiveness_plan_kpis pk set
  responsible_unit='Compliance / Division of Administration Services and Finance', estado='no_cumplido',
  resultado=0, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E6-O01';

insert into effectiveness_evidence (plan_kpi_id, label, pending, uploaded_by)
 select pk.id, 'No se realizaron capacitaciones en ética e inclusión.', true, 'Reporte 2025-2026'
   from effectiveness_plan_kpis pk join effectiveness_kpis k on k.id=pk.kpi_id
  where trim(k.code)='E6-O01'
    and not exists (select 1 from effectiveness_evidence x where x.plan_kpi_id=pk.id);

update effectiveness_plan_kpis pk set
  responsible_unit='Division of Student Services / Administration Services and Finance', estado='cumplido',
  resultado=91, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E7-I01';

insert into effectiveness_evidence (plan_kpi_id, label, pending, uploaded_by)
 select pk.id, 'Ratios 801 Data Collection (18.11.25) .xlsx', true, 'Reporte 2025-2026'
   from effectiveness_plan_kpis pk join effectiveness_kpis k on k.id=pk.kpi_id
  where trim(k.code)='E7-I01'
    and not exists (select 1 from effectiveness_evidence x where x.plan_kpi_id=pk.id);

update effectiveness_plan_kpis pk set
  responsible_unit='Division of Student Services / Administration Services and Finance', estado='no_cumplido',
  resultado=0, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E7-S01';

insert into effectiveness_evidence (plan_kpi_id, label, pending, uploaded_by)
 select pk.id, 'No se corrió encuesta de Satisfaccion con el apoyo economico y el acceso.', true, 'Reporte 2025-2026'
   from effectiveness_plan_kpis pk join effectiveness_kpis k on k.id=pk.kpi_id
  where trim(k.code)='E7-S01'
    and not exists (select 1 from effectiveness_evidence x where x.plan_kpi_id=pk.id);

update effectiveness_plan_kpis pk set
  responsible_unit='Division of Administration Services and Finance', estado='cumplido',
  resultado=3.9, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E7-O01';

insert into effectiveness_evidence (plan_kpi_id, label, pending, uploaded_by)
 select pk.id, 'Reporte: Monto Total de GRANT Reporte Consolidado de Admisión: Reporte Consolidado de Admisión Blackwell Global University', true, 'Reporte 2025-2026'
   from effectiveness_plan_kpis pk join effectiveness_kpis k on k.id=pk.kpi_id
  where trim(k.code)='E7-O01'
    and not exists (select 1 from effectiveness_evidence x where x.plan_kpi_id=pk.id);

update effectiveness_plan_kpis pk set
  responsible_unit='Division of Administration Services and Finance / President', estado='no_cumplido',
  resultado=0, resultado_updated_at=current_date
 from effectiveness_kpis k where k.id=pk.kpi_id and trim(k.code)='E7-O0';

insert into effectiveness_evidence (plan_kpi_id, label, pending, uploaded_by)
 select pk.id, 'No se han recibido recursos de donantes', true, 'Reporte 2025-2026'
   from effectiveness_plan_kpis pk join effectiveness_kpis k on k.id=pk.kpi_id
  where trim(k.code)='E7-O0'
    and not exists (select 1 from effectiveness_evidence x where x.plan_kpi_id=pk.id);


insert into indicator_results (indicator_id, academic_year_id, period, value, source, note)
select pk.kpi_id, p.academic_year_id, 'anual', pk.resultado, 'manual', 'Reporte de Efectividad 2025-2026'
  from effectiveness_plan_kpis pk
  join effectiveness_plans p on p.id = pk.plan_id
 where pk.resultado is not null and p.academic_year_id is not null
on conflict (indicator_id, academic_year_id, period) do update set value = excluded.value, note = excluded.note;
