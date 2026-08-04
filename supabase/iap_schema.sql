-- ===========================================================================
-- FASE 2 · Institutional Assessment Plan (Plan de Evaluación de Resultados)
--
-- El tercer documento maestro. No es un plan de acciones como los otros dos:
-- es un sistema de medición con calendario. Por eso su estructura es
--
--     Objetivo Institucional → Medida → ventana de recolección → resultado
--                                    → benchmark → plan de mejora
--
-- NO crea una tabla de objetivos institucionales. Los siete IO del documento
-- ya existen en el ERP como los objetivos O1-O7 del Plan Estratégico, con sus
-- KPIs y responsables colgando. Duplicarlos habría garantizado que en un año
-- dijeran cosas distintas. El IAP los referencia.
-- ===========================================================================


-- ── BLOQUE 1 · Tablas ──────────────────────────────────────────────────────

-- El documento vigente. Es plurianual (2025-2028) con ciclo anual.
create table if not exists iap_plans (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  version                text not null default '1.0',
  start_academic_year_id uuid references academic_years(id),
  end_academic_year_id   uuid references academic_years(id),
  doc_owner              text,
  status                 text not null default 'active' check (status in ('active','superseded','draft')),
  created_at             timestamptz not null default now()
);

-- El inventario de medidas (Tabla 4 del documento).
--
-- indicator_id es opcional a propósito: hoy 13 de las 20 medidas no tienen de
-- dónde salir —seis son encuestas y siete son rúbricas, y ninguno de los dos
-- subsistemas existe todavía—. Dejarlas sin indicador y que la pantalla lo
-- diga es más honesto que inventarles una fuente.
create table if not exists iap_measures (
  id               uuid primary key default gen_random_uuid(),
  plan_id          uuid not null references iap_plans(id) on delete cascade,
  code             text not null,
  name             text not null,
  measure_type     text not null check (measure_type in ('directa','indirecta')),
  frequency        text,
  collection_window text,
  responsible_unit text,
  data_source      text,
  indicator_id     uuid references effectiveness_kpis(id) on delete set null,
  status           text not null default 'active',
  created_at       timestamptz not null default now(),
  unique (plan_id, code)
);

-- Alineación medida ↔ objetivo institucional (O1-O7 del plan estratégico).
create table if not exists iap_measure_objectives (
  measure_id   uuid not null references iap_measures(id)      on delete cascade,
  objective_id uuid not null references strategic_objectives(id) on delete cascade,
  primary key (measure_id, objective_id)
);

-- Los estándares institucionales.
--
-- Tabla aparte y no una columna porque el documento fija benchmarks POR NIVEL:
-- graduación >= 39% en bachelor, >= 62% en master, >= 34% en doctoral. Una
-- sola columna obligaría a promediar tres exigencias distintas en un número
-- que no significa nada.
create table if not exists iap_benchmarks (
  id         uuid primary key default gen_random_uuid(),
  measure_id uuid not null references iap_measures(id) on delete cascade,
  scope      text not null default 'general',
  value      numeric not null,
  operator   text not null default '>=' check (operator in ('>=','<=','=')),
  note       text,
  unique (measure_id, scope)
);

-- El calendario anual (Apéndice A).
--
-- measure_codes es text[] y no FK a propósito: el calendario del documento
-- referencia D-10, I-12 e I-13, que no existen en la Tabla 4. Con FK, esas
-- filas no entrarían y el desfase quedaría escondido; como texto, entran y la
-- pantalla puede marcarlas en rojo hasta que la OIQE reconcilie el documento.
create table if not exists iap_calendar (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references iap_plans(id) on delete cascade,
  seq           int  not null,
  period_label  text not null,
  activity      text not null,
  measure_codes text[],
  responsible   text,
  unique (plan_id, seq)
);

-- Plan de Acción para la Mejora: se abre cuando una medida queda bajo el
-- estándar dos años seguidos, o cuando lo pide un acreditador.
create table if not exists iap_improvement_plans (
  id               uuid primary key default gen_random_uuid(),
  measure_id       uuid not null references iap_measures(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  root_cause       text,
  intervention     text,
  resources        text,
  responsible      text,
  milestones       text,
  success_criteria text,
  reassess_on      date,
  status           text not null default 'abierto' check (status in ('abierto','en_curso','cerrado')),
  created_at       timestamptz not null default now()
);

create index if not exists idx_iap_measures_plan on iap_measures (plan_id, code);
create index if not exists idx_iap_mo_objective  on iap_measure_objectives (objective_id);
create index if not exists idx_iap_improve       on iap_improvement_plans (measure_id, academic_year_id);

alter table iap_plans             enable row level security;
alter table iap_measures          enable row level security;
alter table iap_measure_objectives enable row level security;
alter table iap_benchmarks        enable row level security;
alter table iap_calendar          enable row level security;
alter table iap_improvement_plans enable row level security;

grant all on table iap_plans             to service_role;
grant all on table iap_measures          to service_role;
grant all on table iap_measure_objectives to service_role;
grant all on table iap_benchmarks        to service_role;
grant all on table iap_calendar          to service_role;
grant all on table iap_improvement_plans to service_role;


-- ── BLOQUE 2 · El plan y sus 20 medidas ────────────────────────────────────

insert into iap_plans (name, version, start_academic_year_id, end_academic_year_id, doc_owner)
select 'Institutional Assessment Plan 2025-2028', '1.0',
       (select id from academic_years where start_date >= '2025-09-01' order by start_date limit 1),
       (select id from academic_years order by start_date desc limit 1),
       'Office of Institutional Quality and Effectiveness'
 where not exists (select 1 from iap_plans where status = 'active');

insert into iap_measures (plan_id, code, name, measure_type, frequency, collection_window, responsible_unit, data_source)
select p.id, t.code, t.name, t.tipo, t.frec, t.ventana, t.unidad, t.fuente
  from iap_plans p, (values
 ('D-01','Puntuaciones de rúbrica de Student Learning Outcomes por programa','directa','anual','Fall & Spring','Academic Departments','Artefactos calificados'),
 ('D-02','Evaluación de competencias de educación general (rúbricas institucionales)','directa','anual','Fall & Spring','Academic Departments','Trabajo académico incorporado'),
 ('D-03','Calificaciones de evaluación del capstone / tesis de fin de carrera','directa','anual','Fall & Spring','Academic Departments','Formularios de capstone assessment'),
 ('D-04','Evaluaciones de muestras de redacción','directa','anual','Fall & Spring','Comité de Educación General / OIQE','Trabajos entregados en el curso'),
 ('D-05','Puntuaciones de revisión del portafolio electrónico','directa','anual','Fall & Spring','Academic Departments','Sistema de e-Portfolio'),
 ('D-06','Rúbricas de presentación oral / defensa de tesis o disertación','directa','anual','Fall & Spring','Academic Departments','Registros de faculty rubric'),
 ('D-07','Revisión de los resultados del aprendizaje extracurricular','directa','anual','Fall & Spring','Student Services','Portafolios de programas'),
 ('D-08','Actividad académica y profesional verificable del faculty','directa','anual','Anual','Academic Departments','Sistema de evaluación del faculty'),
 ('D-09','Resultados verificables de alianzas institucionales','directa','anual','Anual','Academic Departments','Contratos y acuerdos comunitarios'),
 ('I-01','Graduate Survey','indirecta','anual','Fall & Spring','Student Services','Plataforma de encuestas'),
 ('I-02','Alumni Survey (1 año después de la graduación)','indirecta','anual','Anual','Student Services','Encuestas / LinkedIn'),
 ('I-03','Employer Satisfaction Survey','indirecta','bienal','Años impares','Student Services','Encuesta en línea'),
 ('I-04','Student Satisfaction Survey','indirecta','anual','Fall','OIQE / Student Affairs','Plataforma de encuestas'),
 ('I-05','Employee Satisfaction Survey','indirecta','anual','Spring','Recursos Humanos / OIQE','Plataforma de encuestas'),
 ('I-06','End-of-Course Survey','indirecta','anual','Fall & Spring','OIQE','Plataforma de encuestas'),
 ('I-07','Retention Rates','indirecta','anual','Continuo','Student Services','SIS (ERP)'),
 ('I-08','Graduation Rates','indirecta','anual','Continuo','Student Services','SIS (ERP)'),
 ('I-09','Indicadores de salud financiera (puntuación compuesta)','indirecta','anual','Anual','Finanzas / OIQE','Estados financieros auditados'),
 ('I-10','Indicadores clave de rendimiento del Plan Estratégico','indirecta','trimestral','Trimestral','Oficina del President / OIQE','Sistema de monitoreo integrado'),
 ('I-11','Número de capacitaciones al personal','indirecta','anual','Anual','Recursos Humanos','Formularios de tasación')
  ) as t(code,name,tipo,frec,ventana,unidad,fuente)
 where p.status = 'active'
on conflict (plan_id, code) do nothing;

-- Alineación a los objetivos institucionales O1-O7 (= IO-1 a IO-7).
insert into iap_measure_objectives (measure_id, objective_id)
select m.id, o.id
  from iap_measures m
  join (values
 ('D-01', array['O1']), ('D-02', array['O1']), ('D-03', array['O1','O4','O7']),
 ('D-04', array['O1']), ('D-05', array['O1','O4']), ('D-06', array['O1','O4','O7']),
 ('D-07', array['O1','O4']), ('D-08', array['O1','O4']), ('D-09', array['O2','O5']),
 ('I-01', array['O1','O4','O5']), ('I-02', array['O1','O2','O5','O6']),
 ('I-03', array['O1','O5']), ('I-04', array['O2','O4','O5','O7']),
 ('I-05', array['O2','O3','O6']), ('I-06', array['O1','O2','O4']),
 ('I-07', array['O1','O6']), ('I-08', array['O1','O6','O7']),
 ('I-09', array['O3','O6','O7']),
 ('I-10', array['O1','O2','O3','O4','O5','O6','O7']),
 ('I-11', array['O2','O3'])
  ) as t(code, objs) on t.code = m.code
  join strategic_objectives o on o.code = any(t.objs::text[]) and o.status = 'active'
on conflict do nothing;

-- Enganchar las medidas que el catálogo YA calcula o mide.
-- (trim: el código del catálogo tiene un espacio al final en algunas filas)
update iap_measures m set indicator_id = k.id
  from effectiveness_kpis k
 where m.indicator_id is null
   and ((m.code = 'I-07' and trim(k.code) = 'E1-I02')
     or (m.code = 'I-08' and trim(k.code) = 'E1-I03')
     or (m.code = 'D-09' and trim(k.code) = 'E5-O01'));


-- ── BLOQUE 3 · Benchmarks y calendario ─────────────────────────────────────

insert into iap_benchmarks (measure_id, scope, value, operator, note)
select m.id, t.scope, t.valor, t.op, t.nota
  from iap_measures m
  join (values
 ('D-01','general',80,'>=','Competencia mínima por SLO'),
 ('D-02','general',80,'>=','Competencia mínima por competencia de educación general'),
 ('D-03','general',80,'>=','Competencia mínima'),
 ('D-04','general',80,'>=','Competencia mínima'),
 ('D-05','general',80,'>=','Competencia mínima'),
 ('D-06','general',80,'>=','Competencia mínima'),
 ('I-01','general',75,'>=','Tasa de respuesta objetivo'),
 ('I-02','general',75,'>=','Tasa de respuesta objetivo'),
 ('I-03','general',30,'>=','Tasa de respuesta objetivo'),
 ('I-04','general',80,'>=','Tasa de respuesta objetivo (faculty/staff/estudiantes)'),
 ('I-05','general',80,'>=','Tasa de respuesta objetivo'),
 ('I-07','general',70,'>=','Retention rate institucional'),
 ('I-08','bachelor',39,'>=','Graduation rate — Bachelor'),
 ('I-08','master',62,'>=','Graduation rate — Master'),
 ('I-08','doctoral',34,'>=','Graduation rate — Doctoral')
  ) as t(code,scope,valor,op,nota) on t.code = m.code
on conflict (measure_id, scope) do nothing;

insert into iap_calendar (plan_id, seq, period_label, activity, measure_codes, responsible)
select p.id, t.seq, t.periodo, t.actividad, t.medidas::text[], t.resp
  from iap_plans p, (values
 (1,'1 – 15 de septiembre','Poner en marcha el ciclo anual; confirmar calendario, unidades responsables, plantillas y acciones de seguimiento del año anterior.',array['I-12'],'OIQE / Oficina del President'),
 (2,'16 – 30 de septiembre','Revisar los resultados del año anterior y confirmar las acciones del nuevo ciclo.',array['D-01..D-10','I-01..I-13'],'OIQE / Academic Affairs / Unit Directors'),
 (3,'Octubre','Confirmar SLOs, medidas directas, rúbricas, benchmarks y calendario de educación general.',array['D-01','D-02','D-03','D-04','D-05','D-06'],'Academic Affairs / Departments / OIQE'),
 (4,'Octubre – noviembre','Revisar y preparar los instrumentos de encuesta y el cronograma de administración.',array['I-01','I-02','I-03','I-04','I-05','I-06','I-07'],'OIQE / Student Services / HR / Academic Affairs'),
 (5,'Fall Term','Recopilar evidencia de evaluación directa: cursos, tareas, redacción, proyectos, portafolios, capstone y extracurriculares.',array['D-01..D-08'],'Academic Departments / Student Services'),
 (6,'Diciembre','Calificación por rúbricas de fall y análisis de resultados de curso, educación general y encuesta de fin de curso.',array['D-01','D-02','D-04','D-08','I-06'],'Academic Affairs / OIQE'),
 (7,'Enero','Revisar resultados de fall y documentar acciones preliminares de mejora.',array['D-01..D-08','I-06'],'Academic Departments / OIQE'),
 (8,'Febrero – marzo','Revisar el progreso de los KPI del plan estratégico y supervisar las acciones de mejora.',array['I-12'],'OIQE / Oficina del President'),
 (9,'Spring Term','Recopilar evidencia de evaluación directa de spring: proyectos finales, defensas, portafolios y extracurriculares.',array['D-01..D-08'],'Academic Departments / Student Services'),
 (10,'1 de abril','Presentar resultados extracurriculares y datos de experiencia estudiantil.',array['D-08','I-04','I-07'],'Assistant Director of Student Services'),
 (11,'Mayo','Evaluación por rúbricas de spring y análisis de cursos, educación general, capstone y tesis.',array['D-01','D-02','D-03','D-04','D-05','D-06'],'Academic Affairs / OIQE'),
 (12,'1 de mayo','Presentar resultados de evaluación directa a nivel de programa e informes de coordinación del faculty.',array['D-01..D-07','D-09'],'Decanos y Jefes de Departamento'),
 (13,'15 de mayo','Presentar datos preliminares de rendimiento estudiantil: retención, completion, graduación y placement.',array['I-08','I-09','I-10'],'Registrar'),
 (14,'31 de mayo','Presentar informes de unidades administrativas, datos de empleados, indicadores financieros y eficacia operativa.',array['I-05','I-11','I-13'],'Unit Directors / HR / Finanzas'),
 (15,'1 – 15 de junio','Enviar a la OIQE los informes resumidos anuales de programas y unidades administrativas.',array['D-01..D-10','I-01..I-13'],'Program Assessment Coordinators / Unit Directors'),
 (16,'30 de junio','Cierre del plazo anual de recopilación y consolidación final de datos.',array['I-08','I-09','I-10','I-11','I-12'],'Registrar / OIQE / Finanzas'),
 (17,'1 – 15 de julio','Elaborar el Annual Institutional Assessment Report e identificar prioridades de mejora.',array['D-01..D-10','I-01..I-13'],'OIQE'),
 (18,'15 de julio','La Oficina del President revisa resultados, acciones y recomendaciones de recursos.',array['I-12'],'Oficina del President / OIQE'),
 (19,'Agosto','Presentar resultados, progreso de KPI y recomendaciones de mejora al Governing Board.',array['I-12'],'Oficina del President / OIQE'),
 (20,'31 de agosto','Cerrar el ciclo anual y preparar la documentación del siguiente.',array['todas'],'OIQE / Unidades responsables')
  ) as t(seq,periodo,actividad,medidas,resp)
 where p.status = 'active'
on conflict (plan_id, seq) do nothing;


-- ── BLOQUE 4 · Verificación ────────────────────────────────────────────────
select 'plan IAP activo (debe ser 1)' as control, count(*)::text as valor from iap_plans where status='active'
union all select 'medidas del inventario (debe ser 20)', count(*)::text from iap_measures
union all select '  · directas', count(*)::text from iap_measures where measure_type='directa'
union all select '  · indirectas', count(*)::text from iap_measures where measure_type='indirecta'
union all select 'medidas ya enganchadas al catálogo', count(*)::text from iap_measures where indicator_id is not null
union all select 'MEDIDAS SIN FUENTE (encuestas + rúbricas)', count(*)::text from iap_measures where indicator_id is null
union all select 'alineaciones medida ↔ objetivo', count(*)::text from iap_measure_objectives
union all select 'objetivos SIN ninguna medida (de O1-O7)', count(*)::text
  from strategic_objectives o where o.status='active' and o.code in ('O1','O2','O3','O4','O5','O6','O7')
    and not exists (select 1 from iap_measure_objectives mo where mo.objective_id=o.id)
union all select 'benchmarks cargados', count(*)::text from iap_benchmarks
union all select 'filas del calendario (debe ser 20)', count(*)::text from iap_calendar;
